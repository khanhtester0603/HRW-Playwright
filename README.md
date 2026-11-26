# HRW Playwright

Bộ kiểm thử mẫu cho giỏ hàng chạy bằng Chromium trên máy cục bộ.
Các case nằm trong `tests/staging/cart.spec.js` và dùng trang demo tại `fixtures/cart.html`.

## Cài đặt và chạy

```sh
npm ci
npx playwright install chromium
npm test
npm run test:smoke
```

`npm test` chạy cả ba case. Lệnh smoke chạy hai case kiểm tra giỏ hàng ban đầu
và luồng thêm sản phẩm. Case regression còn lại kiểm tra thao tác xóa giỏ hàng.

## Tạo hai lần chạy để đối chiếu

Chạy baseline và lưu báo cáo JSON trước khi chạy bản mô phỏng lỗi tính tiền.

```sh
npm test
cp test-results/results.json /tmp/hrw-baseline.json
DEMO_REGRESSION=1 npm test
cp test-results/results.json /tmp/hrw-regression.json
npm run test:report
```

Lần chạy mô phỏng dự kiến có một case pass và hai case fail vì giá sản phẩm
tăng từ 50.000 ₫ lên 60.000 ₫. Lệnh Playwright trả mã thoát khác 0 khi có case fail.
Cả hai báo cáo JSON dùng cùng tên case để đối chiếu kết quả.

Terminal hiển thị tiến độ trong lúc chạy. Sau mỗi lần chạy, Playwright ghi
báo cáo JSON vào `test-results/results.json` và báo cáo HTML vào
`playwright-report/`. Mở case fail trong báo cáo HTML để xem lỗi, ảnh chụp
và trace. Báo cáo mặc định được ghi lại ở lần chạy tiếp theo.

## Platform regression

```sh
npm ci
npx playwright install chromium
npm start
```

Mở [HRW Playwright](http://localhost:4173) trong trình duyệt. Nếu đã có Google
Chrome, có thể chạy `HRW_BROWSER_CHANNEL=chrome npm start` trên macOS/Linux.

1. Vào **Bộ test** để tạo, sửa hoặc xóa cấu hình chạy. Test case Playwright nằm
   trong thư mục `tests/`. Gán tag cho case trong mã nguồn, rồi nhập cùng tag
   vào cấu hình bộ test. Chọn Staging hoặc Production trước khi lưu. Để trống tag
   để chạy toàn bộ case trong môi trường đã chọn.
2. Vào **Thực thi**, chọn bộ test, nhập mã build và bắt đầu chạy. Nhật ký cập
   nhật trong lúc Playwright thực thi.
3. Sau khi chạy xong, mở test case có lỗi để xem lỗi, ảnh chụp và tải trace.
   Có thể mở trace đã tải bằng `npx playwright show-trace trace.zip`.
4. Vào **Báo cáo & so sánh** và chọn hai lần chạy của cùng bộ test. Màn hình
   hiển thị tổng số pass/fail, chênh lệch thời gian và các case đổi trạng thái,
   được thêm hoặc bị bỏ.

Runner chạy lần lượt theo hàng đợi và lưu lịch sử, log, JSON và tệp đính kèm
trong `.platform-data/`. Chạy một instance cho mỗi thư mục dữ liệu. Có thể
đổi thư mục bằng `HRW_DATA_DIR` và đổi cổng bằng `PORT`. Mã build là nhãn
cho lần chạy. Playwright thực thi test từ checkout đang chạy platform.

### Kích hoạt sau build

CI chạy trên cùng máy có thể gửi yêu cầu HTTP sau khi bản build đã sẵn sàng
để kiểm thử. Dùng `GET /api/suites` để tìm ID bộ test.

```sh
curl http://localhost:4173/api/runs \
  -H 'Content-Type: application/json' \
  -d '{"suiteId":"regression","build":"build-142"}'
```

API trả HTTP 202 cùng ID lần chạy. Dùng `GET /api/runs/<id>` để theo dõi
đến khi trạng thái là `passed`, `failed` hoặc `error`. Runner chỉ lắng nghe
trên loopback.

### Bộ test đăng nhập Zuizui

Trong platform, chọn **Đăng nhập Zuizui** (tag `@zuizui`). Chạy riêng từ
terminal bằng `npm run test:zuizui`. Bộ test dùng Chrome có sẵn khi đặt
`HRW_BROWSER_CHANNEL=chrome`.

Cung cấp `ZUIZUI_ORG_CODE`, `ZUIZUI_USERNAME` và `ZUIZUI_PASSWORD` qua biến
môi trường hoặc trong tệp cục bộ `.env.zuizui.local` đã được Git bỏ qua.
Giới hạn quyền tệp cho tài khoản hiện tại (`chmod 600 .env.zuizui.local`).
Bộ test kiểm tra mã tổ chức trống, form tài khoản và phiên đăng nhập sau khi
tải lại. Trace, ảnh chụp và video được tắt để tránh lưu dữ liệu phiên. `npm test` tiếp tục chỉ chạy các case giỏ hàng mẫu.

### Dùng tài khoản Zuizui theo role

Khai báo mỗi tài khoản test một lần trong `.env.zuizui.local` hoặc trong
biến môi trường của runner. Ví dụ với hai role do bộ test đặt tên:

```dotenv
ZUIZUI_ORG_CODE=your-test-org
ZUIZUI_EMPLOYEE_USERNAME=your-employee-login
ZUIZUI_EMPLOYEE_PASSWORD=your-employee-password
ZUIZUI_MANAGER_USERNAME=your-manager-login
ZUIZUI_MANAGER_PASSWORD=your-manager-password
```

Role mặc định `default` dùng `ZUIZUI_USERNAME` và `ZUIZUI_PASSWORD`.
Đặt `ZUIZUI_<ROLE>_ORG_CODE` nếu role thuộc tổ chức riêng. Tên role dùng
chữ thường, có thể kèm chữ số và dấu gạch dưới, ví dụ `hr_admin`.
Biến môi trường được ưu tiên hơn giá trị cùng tên trong tệp cục bộ.

```js
const { test, expect } = require('../../fixtures/zuizui-test');

test.describe('Nhân viên', () => {
  test.use({ role: 'employee' });

  test('Thấy mục Chấm công', { tag: '@zuizui' }, async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Chấm công', exact: true })).toBeVisible();
  });
});
```

Đặt `test.use({ role: 'employee' })` ở cấp file nếu cả file dùng cùng role,
hoặc trong từng `test.describe` nếu cần nhiều role. Fixture đăng nhập trước
khi giao `page` cho test. Mỗi test dùng phiên trình duyệt riêng, nhưng dữ liệu
phía máy chủ vẫn thuộc cùng tài khoản. Khi các case sửa cùng dữ liệu tài
khoản, chạy tuần tự với `npm run test:zuizui -- --workers=1`.

### Tài khoản HaraWorks theo role

Tài khoản test tại `https://haraworks.vn` thuộc tổ chức `DEMO` và được lưu
trong `.env.haraworks.local` đã được Git bỏ qua. Các role đã khai báo gồm
`admin` (Admin) và `store_manager` (Quản lý cửa hàng).

Dùng `accountForRole('admin')` hoặc `accountForRole('store_manager')`
từ `environments/production/accounts.js` để lấy `{ org, username, password }`.
Case đăng nhập HaraWorks sử dụng hàm này để lấy tài khoản theo role.

Trong platform, chọn **Trang chủ Haraworks** để chạy case đăng nhập bằng role
`admin`. Chạy riêng từ terminal bằng `npm run test:haraworks`.


### Cấu trúc theo môi trường

| Môi trường | URL chính | Test | Tài khoản theo role | Page Object |
| --- | --- | --- | --- | --- |
| Staging | https://zuizui.io | `tests/staging/` | `environments/staging/accounts.js`, cấu hình `.env.zuizui.local` | `environments/staging/pages/` |
| Production | https://haraworks.vn | `tests/production/` | `environments/production/accounts.js`, cấu hình `.env.haraworks.local` | `environments/production/pages/` |

Bộ giỏ hàng mẫu nằm trong nhóm Staging và dùng trang HTML cục bộ.
Platform giới hạn thư mục test theo môi trường trước khi áp dụng tag.
