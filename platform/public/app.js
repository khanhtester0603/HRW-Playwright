const app = document.querySelector('#app');
const dialog = document.querySelector('#suite-dialog');
const suiteForm = document.querySelector('#suite-form');
const labels = {
  queued: 'Chờ chạy', running: 'Đang chạy', stopping: 'Đang dừng', stopped: 'Đã dừng', passed: 'Pass', failed: 'Fail', error: 'Lỗi runner',
  expected: 'Pass', unexpected: 'Fail', flaky: 'Flaky', skipped: 'Skip',
  regressed: 'Mới fail', fixed: 'Đã pass lại', added: 'Case mới', removed: 'Đã bỏ', changed: 'Đổi trạng thái',
};
const pageNames = { home: 'Tổng quan', suites: 'Test Script', execute: 'Thực thi', reports: 'Báo cáo & so sánh' };
const formatter = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
const pending = run => ['queued', 'running', 'stopping'].includes(run.status);
const completed = run => ['passed', 'failed'].includes(run.status);
const environments = {
  staging: { label: 'Staging', url: 'https://zuizui.io' },
  production: { label: 'Production', url: 'https://haraworks.vn' },
};
let suites = [];
let runs = [];
let editing;
let refresh;
let generation = 0;

function e(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

async function api(url, method = 'GET', value) {
  const response = await fetch(url, {
    method,
    ...(value !== undefined && {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

const badge = status => '<span class="badge ' + e(status) + '">' + e(labels[status] || status) + '</span>';
const date = value => formatter.format(new Date(value));
const duration = value => value == null ? '—' : value < 1000 ? value + ' ms' : (value / 1000).toFixed(1) + ' s';
const logText = run => run.log || (pending(run) ? 'Đang chờ nhật ký từ Playwright…' : 'Không có nhật ký.');
const elapsed = run => run.startedAt && run.finishedAt ? new Date(run.finishedAt) - new Date(run.startedAt) : null;
const runUrl = run => '#run/' + run.id;
const apiUrl = run => '/api/runs/' + run.id;
const runScope = run => run.selectedCase ? 'Case: ' + run.selectedCase.title : 'Toàn bộ Test Script';
const runTitle = run => run.build + ' · ' + run.suite.name + ' · ' + runScope(run);
const link = (url, label, style = 'text-link') => '<a class="' + style + '" href="' + e(url) + '">' + e(label) + '</a>';
const primary = (url, label) => link(url, label, 'button primary');
const empty = (icon, title, message) => `<div class="empty"><span aria-hidden="true">${icon}</span><strong>${e(title)}</strong><p>${e(message)}</p></div>`;
const head = (title, description, button = '') => `<div class="page-head"><div><h1>${e(title)}</h1><p>${e(description)}</p></div>${button}</div>`;
const panel = (title, contents, action = '') => `<section class="panel"><div class="panel-head"><h2>${e(title)}</h2>${action}</div>${contents}</section>`;
const tag = suite => `<span class="tag">${e(suite.tag || 'Tất cả test')}</span>`;
const metric = (icon, value, title) => `<div class="metric"><span class="metric-icon" aria-hidden="true">${icon}</span><strong>${e(value)}</strong><small>${e(title)}</small></div>`;
const option = (value, title) => `<option value="${e(value)}">${e(title)}</option>`;

function table(headers, rows) {
  return `<div class="table-scroll"><table><thead><tr>${headers.map(title => '<th scope="col">' + e(title) + '</th>').join('')}</tr></thead><tbody>${rows.map(cells => '<tr>' + cells.map(cell => '<td>' + cell + '</td>').join('') + '</tr>').join('')}</tbody></table></div>`;
}

function history(list) {
  if (!list.length) return empty('◷', 'Chưa có lần chạy', 'Chạy một Test Script để tạo báo cáo đầu tiên.');
  return table(['Bản build', 'Test Script', 'Phạm vi', 'Trạng thái', 'Thời điểm'], list.map(run => [
    link(runUrl(run), run.build), e(run.suite.name), e(runScope(run)), badge(run.status), e(date(run.createdAt)),
  ]));
}

function searchText(value) {
  return value.trim().toLocaleLowerCase('vi').normalize('NFD')
    .replace(/\p{M}/gu, '').replaceAll('đ', 'd');
}

function selectOptions(selectId) {
  if (selectId === 'suite-select') {
    return suites.map(suite => {
      const title = suite.name + ' · ' + environments[suite.environment].label;
      return { value: suite.id, title, search: title + ' ' + suite.tag };
    });
  }
  return runs.filter(completed).map(run => {
    const title = runTitle(run) + ' · ' + date(run.createdAt);
    return { value: run.id, title, search: title };
  });
}

function searchableSelect(id, name, label, placeholder) {
  return `<div class="searchable-select" data-combobox>
    <label for="${id}">${label}</label>
    <div class="combo-field">
      <input type="text" id="${id}" role="combobox" aria-autocomplete="list"
        aria-expanded="false" aria-controls="${id}-options" autocomplete="off"
        placeholder="${placeholder}" required>
      <span class="combo-chevron" aria-hidden="true"></span>
      <input type="hidden" name="${name}">
      <div class="combo-menu" hidden>
        <div id="${id}-options" role="listbox" aria-label="${label}"></div>
        <p class="combo-empty" role="status" hidden>Không có kết quả phù hợp</p>
      </div>
    </div>
  </div>`;
}

function bindCombobox(container, initialValue) {
  const input = container.querySelector('[role="combobox"]');
  const value = container.querySelector('input[type="hidden"]');
  const menu = container.querySelector('.combo-menu');
  const list = container.querySelector('[role="listbox"]');
  const emptyMessage = container.querySelector('.combo-empty');
  const items = selectOptions(input.id);
  let selected = items.find(item => item.value === initialValue);
  let matches = [];
  let active = -1;

  function close() {
    menu.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function commit(item) {
    selected = item;
    value.value = item?.value || '';
    input.value = item?.title || '';
    input.setCustomValidity('');
    close();
  }

  function highlight(index) {
    if (!matches.length) return;
    active = index;
    for (const [i, element] of Array.from(list.children).entries()) {
      element.classList.toggle('active', i === active);
    }
    const element = list.children[active];
    input.setAttribute('aria-activedescendant', element.id);
    element.scrollIntoView({ block: 'nearest' });
  }

  function show() {
    const query = value.value ? '' : searchText(input.value);
    matches = items.filter(item => searchText(item.search).includes(query));
    active = -1;
    input.removeAttribute('aria-activedescendant');
    list.innerHTML = matches.map((item, i) =>
      `<div id="${input.id}-option-${i}" role="option" aria-selected="${item.value === value.value}" data-index="${i}">${e(item.title)}</div>`
    ).join('');
    emptyMessage.hidden = !!matches.length;
    menu.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  input.addEventListener('focus', () => { if (value.value) input.select(); });
  input.addEventListener('click', () => {
    if (!menu.hidden) return;
    if (value.value) input.select();
    show();
  });
  input.addEventListener('input', () => {
    value.value = '';
    input.setCustomValidity(input.value ? 'Hãy chọn một mục trong danh sách.' : '');
    show();
  });
  input.addEventListener('blur', close);
  input.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (menu.hidden) show();
      const next = event.key === 'ArrowDown' ? Math.min(active + 1, matches.length - 1)
        : active < 0 ? matches.length - 1 : Math.max(0, active - 1);
      highlight(next);
    } else if (event.key === 'Enter' && !menu.hidden && matches.length) {
      event.preventDefault();
      commit(matches[Math.max(active, 0)]);
    } else if (event.key === 'Escape' && !menu.hidden) {
      event.preventDefault();
      commit(selected);
    }
  });
  list.addEventListener('mousedown', event => event.preventDefault());
  list.addEventListener('click', event => {
    const optionElement = event.target.closest('[role="option"]');
    if (optionElement) commit(matches[Number(optionElement.dataset.index)]);
  });
  commit(selected);
}

function filterableHistory(limit = 0) {
  return `<div class="form-grid history-filters">
    <label>Tìm trong lịch sử<input type="search" data-history-filter placeholder="Nhập mã build hoặc tên Test Script"></label>
    <label>Trạng thái<select aria-label="Trạng thái" data-history-filter>
      ${option('', 'Tất cả trạng thái')}
      ${['queued', 'running', 'stopping', 'stopped', 'passed', 'failed', 'error'].map(status => option(status, labels[status])).join('')}
    </select></label>
  </div>
  <div data-history-list="${limit}" aria-live="polite">${history(limit ? runs.slice(0, limit) : runs)}</div>`;
}

app.addEventListener('input', event => {
  const control = event.target;
  if (control.hasAttribute('data-history-filter')) {
    const filters = control.closest('.history-filters');
    const query = searchText(filters.querySelector('input').value);
    const status = filters.querySelector('select').value;
    const list = filters.nextElementSibling;
    const limit = Number(list.dataset.historyList);
    const matching = runs.filter(run =>
      (!status || run.status === status) &&
      (searchText(run.build).includes(query) || searchText(run.suite.name).includes(query))
    );
    const visible = limit && !query && !status ? matching.slice(0, limit) : matching;
    list.innerHTML = !visible.length && (query || status)
      ? empty('◷', 'Không có lần chạy phù hợp', 'Thử đổi từ khóa hoặc trạng thái.')
      : history(visible);
  }
});

function home() {
  const latest = runs.find(completed);
  const suiteList = suites.length ? suites.slice(0, 4).map(suite => `
    <div class="suite-row"><span class="metric-icon" aria-hidden="true">▤</span>
    <div><strong>${e(suite.name)}</strong>${tag(suite)}</div>
    ${link('#execute/' + suite.id, 'Chạy ›')}</div>`).join('') : empty('▤', 'Chưa có Test Script', 'Tạo Test Script đầu tiên trong workspace.');
  return head('Tổng quan regression', 'Theo dõi Test Script và kết quả kiểm thử sau mỗi bản build.', primary('#execute', '▷ Chạy Test Script')) +
    `<div class="metrics">
      ${metric('▤', suites.length, 'Test Script')}
      ${metric('◷', runs.length, 'Lần chạy')}
      ${metric('✓', latest ? latest.counts.expected : '—', 'Pass ở lần gần nhất')}
      ${metric('!', latest ? latest.counts.unexpected : '—', 'Fail ở lần gần nhất')}
    </div>
    <div class="home-grid">
      ${panel('Lần chạy gần đây', history(runs.slice(0, 6)), link('#reports', 'Xem lịch sử ›'))}
      ${panel('Test Script', suiteList, link('#suites', 'Quản lý ›'))}
    </div>`;
}

function manageSuites() {
  const renderCard = suite => `<article class="suite-card">
    <div>${tag(suite)}</div><h2>${e(suite.name)}</h2>
    ${suite.description ? '<p>' + e(suite.description) + '</p>' : ''}
    <div class="actions">${primary('#execute/' + suite.id, '▷ Chạy')}
    ${link('#suites/' + suite.id, 'Chi tiết', 'button secondary')}
    <button class="button secondary" data-edit="${suite.id}">Sửa</button>
    <button class="button secondary danger" data-delete="${suite.id}">Xóa</button></div>
    </article>`;
  const groups = Object.entries(environments).map(([environment, { label, url }]) => {
    const cards = suites.filter(suite => suite.environment === environment).map(renderCard).join('');
    return panel(label + ' · ' + url, cards
      ? `<div class="panel-body"><div class="suite-grid">${cards}</div></div>`
      : empty('▤', 'Chưa có Test Script', 'Tạo Test Script cho môi trường này.'));
  }).join('');
  return head('Quản lý Test Script', 'Nhóm các case Playwright bằng tag để chạy lại theo phạm vi kiểm thử.', '<button class="button primary" data-edit="">＋ Tạo Test Script</button>') +
    '<div id="manage-error" class="form-error" role="alert" hidden></div>' +
    groups;
}

function suiteDetail({ suite, cases }) {
  const items = cases.map(test => `<details class="checklist-case">
    <summary>${e(test.title)} <span class="checklist-count">${test.steps.length} bước</span></summary>
    <div class="case-actions">${link('#execute/' + suite.id + '/case/' + encodeURIComponent(test.id), '▷ Chạy case', 'button secondary')}</div>
    ${test.steps.length ? `<ol>${test.steps.map(step => `<li>${e(step)}</li>`).join('')}</ol>`
      : '<p>Case này chưa khai báo các bước.</p>'}
  </details>`).join('');
  const environment = environments[suite.environment];
  return link('#suites', '‹ Về danh sách Test Script') +
    head(suite.name, environment.label + ' · ' + environment.url, primary('#execute/' + suite.id, '▷ Chạy Test Script')) +
    (suite.description ? '<p>' + e(suite.description) + '</p>' : '') +
    panel('Checklist · ' + cases.length + ' case', items
      ? `<div class="panel-body checklist">${items}</div>`
      : empty('▤', 'Chưa có case', 'Kiểm tra môi trường và tag của Test Script.'));
}

function execute(suite, selectedCase) {
  const form = `<form id="run-form" class="panel-body">
    <div class="form-error" role="alert" hidden></div>
    <div class="form-grid">
      ${selectedCase ? `<div><strong>${e(suite.name)}</strong><p>${e(selectedCase.title)}</p>
        <input type="hidden" name="suiteId" value="${e(suite.id)}">
        <input type="hidden" name="caseId" value="${e(selectedCase.id)}"></div>`
        : searchableSelect('suite-select', 'suiteId', 'Test Script', 'Chọn Test Script')}
      <label>Mã build<input name="build" required maxlength="96" placeholder="Ví dụ build-142 hoặc commit SHA"></label>
    </div>
    <label class="headed-option"><input type="checkbox" name="headed">
      <span>Hiện trình duyệt<br><small>Giữ cửa sổ trên máy chạy Platform sau khi test kết thúc.</small></span>
    </label>
    <button class="button primary">▷ Run test</button>
  </form>`;
  return head(selectedCase ? 'Thực thi một test case' : 'Thực thi Test Script',
    selectedCase ? 'Nhập mã build cho case đã chọn.' : 'Chọn Test Script và gắn mã build để truy lại kết quả.',
    selectedCase ? link('#suites/' + suite.id, '‹ Về Test Script') : '') +
    panel('Cấu hình lần chạy', suites.length ? form : empty('▤', 'Cần có ít nhất một Test Script', 'Tạo Test Script trong trang quản lý trước khi chạy.'), suites.length ? '' : link('#suites', 'Quản lý Test Script')) +
    panel('Lần chạy gần đây', filterableHistory(5));
}

function runPage(run) {
  const totals = `<div class="metrics">
    ${metric('✓', run.counts.expected, 'Pass')}
    ${metric('!', run.counts.unexpected, 'Fail')}
    ${metric('↻', run.counts.flaky, 'Flaky')}
    ${metric('–', run.counts.skipped, 'Skip')}
  </div>`;
  const rows = run.cases.map(test => [
    test.error ? link(runUrl(run) + '/case/' + encodeURIComponent(test.id), test.title) : e(test.title),
    e(test.file), badge(test.status), e(duration(test.duration)),
  ]);
  const action = run.status === 'running' ? `<form id="stop-form" data-run-id="${e(run.id)}">
    <button class="button secondary danger">Dừng</button>
  </form>` : '';
  const replay = !pending(run) && suites.some(suite => suite.id === run.suite.id) ? `<form id="run-form">
    <input type="hidden" name="suiteId" value="${e(run.suite.id)}">
    <input type="hidden" name="build" value="${e(run.build)}">
    <input type="hidden" name="headed" value="1">
    ${run.regression ? '<input type="hidden" name="regression" value="1">' : ''}
    ${run.selectedCase ? '<input type="hidden" name="caseId" value="' + e(run.selectedCase.id) + '">' : ''}
    <button class="button secondary">Chạy lại có trình duyệt</button>
  </form>` : '';
  return head(run.build, run.suite.name + ' · ' + runScope(run) + ' · ' +
    (run.headed ? 'Có cửa sổ trình duyệt · ' : '') + date(run.createdAt) + (run.finishedAt ? ' · ' + duration(elapsed(run)) : ''),
    '<div class="actions">' + badge(run.status) + action + replay + '</div>') +
    '<div id="stop-error" class="form-error" role="alert" hidden></div>' +
    (pending(run) ? '' : totals) +
    (run.error ? '<div class="form-error" role="alert">' + e(run.error) + '</div>' : '') +
    (rows.length ? panel('Kết quả test case', table(['Test case', 'Tệp', 'Trạng thái', 'Thời gian'], rows), link(apiUrl(run) + '/report', 'Tải JSON')) : '') +
    panel('Nhật ký thực thi', '<pre class="log" tabindex="0">' + e(logText(run)) + '</pre>', run.log ? link(apiUrl(run) + '/log', 'Xem toàn bộ log') : '') +
    link('#reports', '‹ Về lịch sử');
}

function casePage(run, test) {
  if (!test) return empty('!', 'Không tìm thấy test case', 'Mở lại từ kết quả của lần chạy.');
  const artifactUrl = artifact => apiUrl(run) + '/artifacts?file=' + encodeURIComponent(artifact.path);
  const screenshot = test.artifacts.find(artifact => artifact.name === 'screenshot');
  const trace = test.artifacts.find(artifact => artifact.name === 'trace');
  return head(test.title, runTitle(run) + ' · ' + duration(test.duration), badge(test.status)) +
    panel('Chi tiết lỗi', '<div class="panel-body"><pre class="error-log">' + e(test.error) + '</pre></div>') +
    (screenshot || trace ? panel('Tệp đính kèm', '<div class="panel-body">' +
      (trace ? link(artifactUrl(trace), 'Tải Playwright trace', 'button secondary') : '') +
      (screenshot ? `<img class="artifact-image" src="${e(artifactUrl(screenshot))}" alt="Ảnh chụp lúc test fail">` : '') + '</div>') : '') +
    link(runUrl(run), '‹ Về kết quả lần chạy');
}

function reports() {
  const available = runs.filter(completed);
  return head('Báo cáo & so sánh', 'Đối chiếu hai lần chạy cùng Test Script và cùng phạm vi.') +
    panel('So sánh lần chạy', available.length > 1 ? `<div class="panel-body">
      <form id="compare-form">
        <div class="form-grid">
          ${searchableSelect('base-select', 'base', 'Baseline', 'Chọn lần chạy gốc')}
          ${searchableSelect('target-select', 'target', 'Lần chạy đối chiếu', 'Chọn lần chạy')}
        </div><br><button class="button primary">So sánh</button>
      </form>
    </div>` : empty('◷', 'Cần hai lần chạy hoàn tất', 'Chạy cùng một Test Script qua hai bản build để đối chiếu.'), '') +
    '<div id="comparison" aria-live="polite"></div>' +
    panel('Lịch sử chạy', filterableHistory());
}

function comparison(base, target) {
  const previous = new Map(base.cases.map(test => [test.id, test]));
  const current = new Map(target.cases.map(test => [test.id, test]));
  const ids = new Set([...current.keys(), ...previous.keys()]);
  const changes = [];
  for (const id of ids) {
    const before = previous.get(id);
    const after = current.get(id);
    if (before?.status === after?.status) continue;
    const status = !before ? 'added' : !after ? 'removed' :
      after.status === 'unexpected' ? 'regressed' :
      before.status === 'unexpected' && after.status === 'expected' ? 'fixed' : 'changed';
    const title = after?.error ? link(runUrl(target) + '/case/' + encodeURIComponent(id), after.title) : e((after || before).title);
    changes.push([
      title, before ? badge(before.status) : '—', after ? badge(after.status) : '—', badge(status),
    ]);
  }
  const heading = base.build + ' → ' + target.build;
  const delta = elapsed(target) - elapsed(base);
  const change = (value, prior) => (value - prior > 0 ? '+' : '') + (value - prior);
  return panel(heading, `<div class="panel-body"><p>
    Pass ${base.counts.expected} → ${target.counts.expected} (${change(target.counts.expected, base.counts.expected)}) ·
    Fail ${base.counts.unexpected} → ${target.counts.unexpected} (${change(target.counts.unexpected, base.counts.unexpected)}) ·
    Thời gian ${duration(elapsed(base))} → ${duration(elapsed(target))} (${delta < 0 ? '−' : '+'}${duration(Math.abs(delta))})
    </p></div>` + (changes.length ? table(['Test case', 'Baseline', 'Đối chiếu', 'Thay đổi'], changes)
    : empty('✓', 'Trạng thái các case trùng khớp', 'Hai lần chạy có cùng danh sách case và trạng thái.')));
}

function showError(element, error) {
  element.textContent = error.message;
  element.hidden = false;
}

function openSuite(id) {
  editing = suites.find(suite => suite.id === id);
  document.querySelector('#dialog-title').textContent = editing ? 'Sửa Test Script' : 'Tạo Test Script';
  document.querySelector('#suite-error').hidden = true;
  suiteForm.reset();
  suiteForm.elements.environment.value = editing?.environment || 'staging';
  for (const name of ['name', 'tag', 'description']) suiteForm.elements[name].value = editing?.[name] || '';
  dialog.showModal();
}

document.querySelector('#close-dialog').onclick = () => dialog.close();
document.querySelector('#cancel-dialog').onclick = () => dialog.close();
suiteForm.onsubmit = async event => {
  event.preventDefault();
  const submit = suiteForm.querySelector('button:not([type])');
  submit.disabled = true;
  try {
    await api(editing ? '/api/suites/' + editing.id : '/api/suites', editing ? 'PUT' : 'POST', Object.fromEntries(new FormData(suiteForm)));
    dialog.close();
    await render();
  } catch (error) {
    showError(document.querySelector('#suite-error'), error);
  } finally {
    submit.disabled = false;
  }
};

const deleteDialog = document.querySelector('#delete-dialog');
const deleteForm = document.querySelector('#delete-form');
const deleteSubmit = deleteForm.querySelector('button:not([type])');
const deleteError = deleteForm.querySelector('.form-error');

function closeDeleteDialog() {
  if (!deleteSubmit.disabled) deleteDialog.close();
}

document.querySelector('#close-delete').onclick = closeDeleteDialog;
document.querySelector('#cancel-delete').onclick = closeDeleteDialog;
deleteDialog.addEventListener('cancel', event => {
  if (deleteSubmit.disabled) event.preventDefault();
});

app.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.hasAttribute('data-edit')) return openSuite(button.dataset.edit);
  const suite = suites.find(item => item.id === button.dataset.delete);
  if (!suite) return;

  deleteForm.reset();
  deleteForm.dataset.suiteId = suite.id;
  deleteError.hidden = true;
  document.querySelector('#delete-description').textContent =
    'Test Script “' + suite.name + '” sẽ bị xóa. Lịch sử chạy được giữ theo mặc định.';
  deleteDialog.showModal();
});

deleteForm.addEventListener('submit', async event => {
  event.preventDefault();
  const deleteHistory = deleteForm.elements.deleteHistory.checked;
  deleteSubmit.disabled = true;
  deleteForm.elements.deleteHistory.disabled = true;
  deleteError.hidden = true;
  try {
    const result = await api('/api/suites/' + deleteForm.dataset.suiteId, 'DELETE', { deleteHistory });
    deleteDialog.close();
    await render();
    if (result.warning) {
      const notice = document.querySelector('#manage-error');
      if (notice) showError(notice, new Error(result.warning));
    }
  } catch (error) {
    showError(deleteError, error);
  } finally {
    deleteSubmit.disabled = false;
    deleteForm.elements.deleteHistory.disabled = false;
  }
});

app.addEventListener('submit', async event => {
  const form = event.target;
  if (!['run-form', 'compare-form', 'stop-form'].includes(form.id)) return;
  event.preventDefault();
  const button = form.querySelector('button');
  const values = new FormData(form);
  button.disabled = true;
  try {
    if (form.id === 'stop-form') {
      await api('/api/runs/' + form.dataset.runId + '/stop', 'POST');
      if (form.isConnected) await render();
    } else if (form.id === 'run-form') {
      const run = await api('/api/runs', 'POST', {
        build: values.get('build'), suiteId: values.get('suiteId'),
        ...(values.has('caseId') && { caseId: values.get('caseId') }),
        headed: values.has('headed'), regression: values.has('regression'),
      });
      location.hash = runUrl(run);
    } else {
      const baseId = values.get('base');
      const targetId = values.get('target');
      if (baseId === targetId) throw new Error('Hãy chọn hai lần chạy khác nhau.');
      const [base, target] = await Promise.all([api('/api/runs/' + baseId), api('/api/runs/' + targetId)]);
      if (base.suite.id !== target.suite.id) throw new Error('Hãy chọn hai lần chạy của cùng một Test Script.');
      if (!completed(base) || !completed(target) || base.selectedCase?.id !== target.selectedCase?.id) {
        throw new Error('Hãy chọn hai lần chạy hoàn tất có cùng phạm vi kiểm thử.');
      }
      const output = document.querySelector('#comparison');
      if (output) output.innerHTML = comparison(base, target);
    }
  } catch (error) {
    if (form.id === 'stop-form') {
      if (form.isConnected) showError(document.querySelector('#stop-error'), error);
    } else if (form.id === 'run-form') {
      if (form.isConnected) showError(form.querySelector('.form-error') || document.querySelector('#stop-error'), error);
    }
    else {
      const output = document.querySelector('#comparison');
      if (output) output.innerHTML = '<div class="form-error" role="alert">' + e(error.message) + '</div>';
    }
  } finally {
    button.disabled = false;
  }
});

async function render() {
  clearTimeout(refresh);
  const token = ++generation;
  const [page, id, subpage, caseId] = (location.hash.slice(1) || 'home').split('/');
  const navPage = page === 'run' ? 'execute' : Object.hasOwn(pageNames, page) ? page : 'home';
  document.querySelector('#breadcrumb').textContent = page === 'suites' && id ? 'Chi tiết Test Script' : subpage === 'case' ? 'Chi tiết lỗi' : page === 'run' ? 'Kết quả lần chạy' : pageNames[navPage];
  for (const item of document.querySelectorAll('[data-nav]')) {
    if (item.dataset.nav === navPage) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
  try {
    if (page === 'suites' && id) {
      app.innerHTML = empty('◷', 'Đang tải checklist', 'Đang đọc các case từ Playwright.');
      const details = await api('/api/suites/' + encodeURIComponent(id) + '/cases');
      if (token === generation) app.innerHTML = suiteDetail(details);
      return;
    }
    const log = app.querySelector('.log');
    const followLog = !log || (log.scrollHeight - log.scrollTop - log.clientHeight < 25);
    const [nextSuites, nextRuns, run] = await Promise.all([
      api('/api/suites'), api('/api/runs'), page === 'run' ? api('/api/runs/' + id) : null,
    ]);
    if (token !== generation) return;
    suites = nextSuites;
    runs = nextRuns;
    if (run && subpage === 'case') app.innerHTML = casePage(run, run.cases.find(test => test.id === decodeURIComponent(caseId)));
    else if (run) {
      const sameStatus = app.dataset.run === run.id && app.dataset.status === run.status;
      if (sameStatus && log && pending(run) && (!run.log || app.querySelector('a[href$="/log"]'))) {
        if (log.textContent !== logText(run)) log.textContent = logText(run);
      } else {
        app.innerHTML = runPage(run);
      }
      app.dataset.run = run.id;
      app.dataset.status = run.status;
      const updatedLog = app.querySelector('.log');
      updatedLog.scrollTop = followLog ? updatedLog.scrollHeight : log.scrollTop;
      if (pending(run)) refresh = setTimeout(render, 800);
    } else if (page === 'suites') app.innerHTML = manageSuites();
    else if (page === 'execute') {
      if (subpage === 'case' && id) {
        const { suite, cases } = await api('/api/suites/' + encodeURIComponent(id) + '/cases');
        if (token !== generation) return;
        const selectedCase = cases.find(test => test.id === decodeURIComponent(caseId));
        if (!selectedCase) throw new Error('Case không còn thuộc Test Script. Hãy mở lại checklist.');
        app.innerHTML = execute(suite, selectedCase);
        return;
      }
      app.innerHTML = execute();
      const combo = app.querySelector('[data-combobox]');
      if (combo) bindCombobox(combo, suites.find(suite => suite.id === id)?.id || suites[0].id);
    } else if (page === 'reports') {
      app.innerHTML = reports();
      app.querySelectorAll('[data-combobox]').forEach(combo => bindCombobox(combo));
    }
    else app.innerHTML = home();
  } catch (error) {
    if (token === generation) app.innerHTML = empty('!', 'Không tải được trang', error.message);
  } finally {
    if (token === generation) app.setAttribute('aria-busy', 'false');
  }
}
window.addEventListener('hashchange', render);
render();
