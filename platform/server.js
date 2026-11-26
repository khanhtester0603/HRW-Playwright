const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { randomUUID } = require('node:crypto');
const environments = require('../environments');
const tailscaleHost = process.env.HRW_TAILSCALE_HOST;

function isTailnetRequest(req) {
  return Boolean(tailscaleHost && req.headers.host === tailscaleHost && req.headers['tailscale-user-login']);
}

const root = path.resolve(__dirname, '..');
const data = path.resolve(process.env.HRW_DATA_DIR || path.join(root, '.platform-data'));
fs.mkdirSync(data, { recursive: true });

const stateFile = path.join(data, 'state.json');
let state;
const initialState = {
  suites: [
    { id: 'tnb-menu', name: 'TNB – Truy cập menu', tag: '@tnb-menu', description: 'Kiểm tra admin truy cập 11 menu Thư Nội Bộ.' },
    { id: 'tnb', name: 'TNB', tag: '@tnb', description: 'Admin gửi thư nội bộ cho AUTO000340 và kiểm tra thư đến bằng tài khoản người nhận.' },
    { id: 'haraworks-home', name: 'Trang chủ Haraworks', tag: '@haraworks-home', description: 'Xác minh tài khoản role admin đăng nhập thành công vào trang chủ HaraWorks.' },
    { id: 'zuizui-login', name: 'Đăng nhập Zuizui', tag: '@zuizui', description: 'Xác minh đăng nhập Zuizui qua mã tổ chức và vào màn hình làm việc.' },
    { id: 'smoke', name: 'Smoke giỏ hàng', tag: '@smoke', description: 'Kiểm tra giỏ trống và cập nhật tổng tiền khi thêm sản phẩm.' },
    { id: 'regression', name: 'Regression giỏ hàng', tag: '@regression', description: 'Kiểm tra toàn bộ luồng giỏ hàng, bao gồm xóa sản phẩm.' },
  ],
  runs: [],
};

function save() {
  fs.writeFileSync(stateFile + '.tmp', JSON.stringify(state));
  fs.renameSync(stateFile + '.tmp', stateFile);
}

function inferEnvironment(tag) {
  return /^@(haraworks-home|tnb(?:-.*)?)$/.test(tag) ? 'production' : 'staging';
}

function loadState() {
  state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : initialState;
  for (const suite of [...state.suites, ...state.runs.map(run => run.suite)]) {
    suite.environment ??= inferEnvironment(suite.tag);
  }
  for (const run of state.runs.filter(run => run.status === 'running')) {
    run.status = 'error';
    run.finishedAt = new Date().toISOString();
    run.error = 'Platform đã dừng trước khi lần chạy hoàn tất.';
  }
  save();
}

function readResults(report, output) {
  const cases = [];
  function visit(suite) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests) {
        const result = test.results.findLast(attempt => attempt.errors.length) || test.results.at(-1);
        if (!result) continue;
        const artifacts = result.attachments.flatMap(attachment => {
          if (!attachment.path || !['screenshot', 'trace'].includes(attachment.name)) return [];
          const relative = path.relative(output, attachment.path);
          if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return [];
          return [{ name: attachment.name, path: relative }];
        });
        cases.push({
          id: spec.id + '/' + test.projectName,
          title: spec.title,
          file: spec.file,
          status: test.status,
          duration: test.results.reduce((total, attempt) => total + attempt.duration, 0),
          error: result.errors.map(error => error.stack || error.message || error.value).filter(Boolean).join('\n\n'),
          artifacts,
        });
      }
    }
    for (const child of suite.suites || []) visit(child);
  }
  for (const suite of report.suites) visit(suite);
  return cases;
}

function playwrightArgs(suite) {
  const args = [require.resolve('@playwright/test/cli'), 'test', path.join(root, 'tests', suite.environment) + path.sep];
  if (suite.tag) args.push('--grep', '(?:^|\\s)' + suite.tag + '(?=\\s|$)');
  return args;
}

const runCommand = promisify(execFile);

async function listSuiteCases(suite) {
  const env = { ...process.env };
  delete env.PLAYWRIGHT_JSON_OUTPUT_FILE;
  delete env.PLAYWRIGHT_JSON_OUTPUT_NAME;
  let report;
  try {
    const { stdout } = await runCommand(process.execPath, [
      ...playwrightArgs(suite), '--list', '--reporter=json', '--pass-with-no-tests',
    ], { cwd: root, env, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 });
    report = JSON.parse(stdout);
  } catch {
    throw bad('Playwright không đọc được danh sách case của bộ test.', 500);
  }

  const cases = [];
  function visit(group) {
    for (const spec of group.specs || []) {
      const steps = (spec.tests[0]?.annotations || [])
        .filter(annotation => annotation.type === 'checklist-step' && annotation.description)
        .map(annotation => annotation.description);
      cases.push({ id: spec.id, title: spec.title, steps });
    }
    for (const child of group.suites || []) visit(child);
  }
  for (const group of report.suites) visit(group);
  return cases;
}

let child;
function work() {
  if (child) return;
  const run = state.runs.findLast(run => run.status === 'queued');
  if (!run) return;
  const dir = path.join(data, run.id);
  const output = path.join(dir, 'artifacts');
  const reportFile = path.join(dir, 'results.json');
  const logFile = path.join(dir, 'run.log');
  fs.mkdirSync(dir, { recursive: true });
  run.status = 'running';
  run.startedAt = new Date().toISOString();
  save();
  const args = playwrightArgs(run.suite);
  child = spawn(process.execPath, args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      DEMO_REGRESSION: run.regression ? '1' : '0',
      HRW_PLATFORM_RUN: '1',
      HRW_TEST_OUTPUT: output,
      PLAYWRIGHT_JSON_OUTPUT_FILE: reportFile,
    },
  });

  let launchError;
  child.on('error', error => { launchError = error.message; });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', chunk => fs.appendFileSync(logFile, chunk));
  }
  child.once('close', code => {
    run.finishedAt = new Date().toISOString();
    try {
      const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
      run.cases = readResults(report, output);
      run.error = report.errors.map(error => error.message || error.stack).filter(Boolean).join('\n');
      run.status = run.error || !run.cases.length || (code !== 0 && !run.cases.some(test => test.status === 'unexpected'))
        ? 'error'
        : code === 0 ? 'passed' : 'failed';
      if (run.status === 'error' && !run.error) run.error = 'Playwright không hoàn tất được lần chạy.';
    } catch {
      run.error = launchError || 'Playwright không tạo được báo cáo. Xem nhật ký để biết chi tiết.';
      run.status = 'error';
    }
    save();
    child = undefined;
    work();
  });
}

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

function sendFile(res, file, contentType, headers = {}) {
  if (!fs.existsSync(file)) return json(res, 404, { error: 'Không tìm thấy tệp.' });
  res.writeHead(200, { 'Content-Type': contentType, ...headers });
  fs.createReadStream(file).pipe(res);
}

function logTail(file) {
  if (!fs.existsSync(file)) return '';
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const offset = Math.max(0, size - 96_000);
    const buffer = Buffer.alloc(size - offset);
    const count = fs.readSync(fd, buffer, 0, buffer.length, offset);
    return (offset ? '… Hiển thị phần cuối của nhật ký …\n' : '') + buffer.subarray(0, count).toString();
  } finally {
    fs.closeSync(fd);
  }
}

function bad(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

async function body(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw bad('Yêu cầu JSON.');
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16_384) throw bad('Yêu cầu quá lớn.', 413);
  }
  let value;
  try { value = JSON.parse(raw); } catch { throw bad('JSON không hợp lệ.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad('Dữ liệu không hợp lệ.');
  return value;
}

function field(input, name, max, required = false) {
  const value = input[name] === undefined ? '' : input[name];
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) {
    throw bad('Trường ' + name + ' không hợp lệ.');
  }
  return value.trim();
}

function suiteValues(input, currentEnvironment) {
  const tag = field(input, 'tag', 48);
  if (tag && !/^@[a-zA-Z0-9_-]+$/.test(tag)) throw bad('Tag phải có dạng @regression hoặc @smoke.');
  const environment = input.environment ?? currentEnvironment ?? inferEnvironment(tag);
  if (typeof environment !== 'string' || !Object.hasOwn(environments, environment)) {
    throw bad('Môi trường phải là Staging hoặc Production.');
  }
  return { name: field(input, 'name', 80, true), description: field(input, 'description', 300), tag, environment };
}

const staticFiles = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
};

function summary(run) {
  const { cases, ...meta } = run;
  const counts = { expected: 0, unexpected: 0, flaky: 0, skipped: 0 };
  for (const test of cases) counts[test.status]++;
  return { ...meta, counts, total: cases.length };
}

async function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;
  const method = req.method;
  if (req.headers.origin && req.headers.origin !== (isTailnetRequest(req) ? 'https://' : 'http://') + req.headers.host) throw bad('Origin không hợp lệ.', 403);
  if (method === 'GET' && Object.hasOwn(staticFiles, pathname)) {
    const [file, type] = staticFiles[pathname];
    return sendFile(res, path.join(__dirname, 'public', file), type);
  }
  if (pathname === '/api/suites') {
    if (method === 'GET') return json(res, 200, state.suites);
    if (method === 'POST') {
      const suite = { id: randomUUID(), ...suiteValues(await body(req)) };
      state.suites.push(suite);
      save();
      return json(res, 201, suite);
    }
  }
  const suiteDetails = pathname.match(/^\/api\/suites\/([a-z0-9-]+)\/cases$/);
  if (method === 'GET' && suiteDetails) {
    const suite = state.suites.find(item => item.id === suiteDetails[1]);
    if (!suite) throw bad('Không tìm thấy bộ test.', 404);
    return json(res, 200, { suite, cases: await listSuiteCases(suite) });
  }
  let match = pathname.match(/^\/api\/suites\/([a-z0-9-]+)$/);
  if (match && ['PUT', 'DELETE'].includes(method)) {
    const input = method === 'PUT' || req.headers['content-type'] ? await body(req) : {};
    const index = state.suites.findIndex(suite => suite.id === match[1]);
    if (index < 0) throw bad('Không tìm thấy bộ test.', 404);
    if (method === 'PUT') {
      Object.assign(state.suites[index], suiteValues(input, state.suites[index].environment));
      save();
      return json(res, 200, { ok: true });
    }

    if (input.deleteHistory !== undefined && typeof input.deleteHistory !== 'boolean') {
      throw bad('Tùy chọn xóa lịch sử không hợp lệ.');
    }
    const removedRuns = input.deleteHistory ? state.runs.filter(run => run.suite.id === match[1]) : [];
    if (removedRuns.some(run => ['queued', 'running'].includes(run.status))) {
      throw bad('Bộ test có lần chạy đang thực thi hoặc đang chờ. Hãy đợi hoàn tất để xóa lịch sử.', 409);
    }

    const previous = state;
    state = {
      suites: previous.suites.filter(suite => suite.id !== match[1]),
      runs: input.deleteHistory ? previous.runs.filter(run => run.suite.id !== match[1]) : previous.runs,
    };
    try {
      save();
    } catch (error) {
      state = previous;
      throw error;
    }

    let warning;
    for (const run of removedRuns) {
      try {
        fs.rmSync(path.join(data, run.id), { recursive: true, force: true, maxRetries: 2 });
      } catch (error) {
        console.error(error);
        warning = 'Đã xóa bộ test và mục lịch sử, nhưng một số tệp trên đĩa chưa xóa được.';
      }
    }
    return json(res, 200, { ok: true, warning });
  }
  if (pathname === '/api/runs') {
    if (method === 'GET') return json(res, 200, state.runs.map(summary));
    if (method === 'POST') {
      const input = await body(req);
      const suite = state.suites.find(suite => suite.id === input.suiteId);
      if (!suite) throw bad('Hãy chọn bộ test.');
      const run = {
        id: randomUUID(),
        suite: { ...suite },
        build: field(input, 'build', 96, true),
        regression: input.regression === true,
        createdAt: new Date().toISOString(),
        status: 'queued',
        cases: [],
      };
      state.runs.unshift(run);
      save();
      work();
      return json(res, 202, summary(run));
    }
  }
  match = pathname.match(/^\/api\/runs\/([a-f0-9-]+)(?:\/(log|artifacts|report))?$/);
  if (match && method === 'GET') {
    const run = state.runs.find(run => run.id === match[1]);
    if (!run) throw bad('Không tìm thấy lần chạy.', 404);
    const dir = path.join(data, run.id);
    if (match[2] === 'log') return sendFile(res, path.join(dir, 'run.log'), 'text/plain; charset=utf-8');
    if (match[2] === 'report') return sendFile(res, path.join(dir, 'results.json'), 'application/json', { 'Content-Disposition': 'attachment; filename="results.json"' });
    if (match[2] === 'artifacts') {
      const artifact = run.cases.flatMap(test => test.artifacts).find(artifact => artifact.path === url.searchParams.get('file'));
      if (!artifact) throw bad('Không tìm thấy tệp đính kèm.', 404);
      const headers = artifact.name === 'trace' ? { 'Content-Disposition': 'attachment; filename="trace.zip"' } : {};
      return sendFile(res, path.join(dir, 'artifacts', artifact.path), artifact.name === 'trace' ? 'application/zip' : 'image/png', headers);
    }
    return json(res, 200, { ...summary(run), cases: run.cases, log: logTail(path.join(dir, 'run.log')) });
  }
  throw bad('Không tìm thấy trang.', 404);
}

const port = Number(process.env.PORT || 4173);
http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!/^((127\.0\.0\.1)|(localhost))(?::\d+)?$/.test(req.headers.host || '') && !isTailnetRequest(req)) {
    return json(res, 403, { error: 'Chỉ hỗ trợ truy cập cục bộ.' });
  }
  route(req, res).catch(error => {
    if (!error.status) console.error(error);
    json(res, error.status || 500, { error: error.status ? error.message : 'Lỗi nội bộ.' });
  });
}).listen(port, '127.0.0.1', () => {
  loadState();
  console.log('HRW Playwright · http://localhost:' + port);
  work();
});
