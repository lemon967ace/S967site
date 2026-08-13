import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");

test("account creation includes the localized muted password security notice", () => {
  const notices = [
    "Simple or commonly used passwords may be detected by your browser or password manager as compromised or weak, which may trigger a security warning.",
    "단순하거나 흔히 사용되는 비밀번호는 브라우저 또는 비밀번호 관리자에서 유출·취약 비밀번호로 감지되어 보안 경고가 표시될 수 있습니다.",
    "単純なパスワードや一般的によく使われるパスワードは、ブラウザやパスワードマネージャーによって漏洩済みまたは脆弱なパスワードとして検出され、セキュリティ警告が表示される場合があります。",
    "Простые или широко используемые пароли могут быть определены браузером или менеджером паролей как скомпрометированные или слабые, из-за чего может появиться предупреждение безопасности.",
  ];
  assert.match(html, /id="passwordSecurityNotice"\s+class="password-notice"/);
  assert.match(html, /text\.passwordSecurityNotice/);
  for (const notice of notices) assert.ok(html.includes(notice));
});

test("Stage 7 notice does not change the existing password validation limits", () => {
  assert.match(html, /createPassword\.value\.length < 8/);
  assert.match(html, /createPassword\.value\.length > 100/);
});

test("login panel includes the persistent localized new-user explanation", () => {
  const notices = [
    "New here? Enter the ID and password you'd like to use. If the ID isn't registered, you'll be able to create an account.",
    "처음 이용하시나요? 사용할 ID와 비밀번호를 입력해 주세요. 등록되지 않은 ID라면 계정을 생성할 수 있습니다.",
    "初めてご利用ですか？ 使用したいIDとパスワードを入力してください。未登録のIDの場合は、アカウントを作成できます。",
    "Впервые здесь? Введите ID и пароль, которые хотите использовать. Если ID ещё не зарегистрирован, вы сможете создать учётную запись.",
  ];
  assert.match(html, /id="loginStatus"[\s\S]*id="newUserNotice"\s+class="password-notice"/);
  assert.match(html, /text\.newUserNotice/);
  for (const notice of notices) assert.ok(html.includes(notice));
});
