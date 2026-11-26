class PlatformReporter {
  onBegin(_config, suite) {
    console.log(`Đã tìm thấy ${suite.allTests().length} test case`);
  }

  onStdOut(chunk) {
    process.stdout.write(chunk);
  }

  onStdErr(chunk) {
    process.stderr.write(chunk);
  }

  onError(error) {
    console.error(error.stack || error.message || error.value);
  }

  onTestBegin(test) {
    console.log(`▶ Đang chạy · ${test.title}`);
  }

  onStepBegin(_test, _result, step) {
    if (step.category !== 'test.step') return;
    console.log(`  ▶ Bắt đầu bước · ${step.title}`);
  }

  onStepEnd(_test, _result, step) {
    if (step.category !== 'test.step') return;
    const status = step.error ? 'Lỗi' : step.skip ? 'Bỏ qua' : 'Hoàn thành';
    console.log(`  ■ ${status} · ${step.title} · ${step.duration} ms`);
  }

  onTestEnd(test, result) {
    console.log(`■ ${result.status.toUpperCase()} · ${test.title} · ${result.duration} ms`);
    for (const error of result.errors) {
      if (error.message) console.log(error.message);
    }
  }
}

module.exports = PlatformReporter;
