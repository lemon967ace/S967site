const S967_LANGUAGES = {
  en: "English",
  ko: "한국어",
  ja: "日本語",
  ru: "Русский",
};

const S967_LANGUAGE_STORAGE_KEY =
  "s967-language";

 const S967_TRANSLATIONS = {
  en: {
    language: "Language",

    headline:
      "Different Languages. One Server.",

    tagline:
      "Peaceful, open, and connected.",

    inquiry:
      "Inquiry",

    wkApplication:
      "WK Application",

    imageUpload:
      "Image Upload",

    viewImages:
      "View Images",

    unofficial:
      "Unofficial community site for State 967.",

    themeSystem:
      "System",

    themeLight:
      "Light",

    themeDark:
      "Dark",

uploadTitle:
  "Image Upload",

uploadLead:
  "Upload screenshots.<br>PNG, JPG, JPEG · max 5 MB each · up to 3 images.",

uploadNotice:
  "<strong>Uploaded images are public and may be viewed by anyone.</strong><br>Please do not upload personal or sensitive information.<br>Older images may be removed periodically.<br><strong>By uploading images, you acknowledge and agree that they will be publicly accessible.</strong>",

chooseImages:
  "Choose up to 3 images",

uploadImages:
  "Upload Images",

uploadLimit:
  "Limit: up to 8 images per 24 hours from the same network.",

uploadComplete:
  "Upload complete",

uploadSuccess:
  "Your images have been received successfully.",

backHome:
  "← Back to Home",

onlyImagesAllowed:
  "Only PNG, JPG, and JPEG images are allowed.",

imageTooLarge:
  "Each image must be 5 MB or smaller.",

tooManyImages:
  "You can select up to 3 images.",

uploading:
  "Uploading…",

uploadFailed:
  "Upload failed.",
    
    galleryLead:
  "Images uploaded by the community.",

refresh:
  "Refresh",

loadingImages:
  "Loading images…",
    
    galleryLoadFailed:
  "Could not load gallery.",

galleryEmpty:
  "No images have been uploaded yet.",

communityUpload:
  "Community upload",
    inquiryFormTitle:
  "Greetings!",

inquiryCategoryQuestion:
  "What brings you here?",

inquiryCategorySuggestion:
  "Suggestion",

inquiryCategoryReport:
  "Report",

inquiryCategoryInquiry:
  "Inquiry (including immigration)",

inquiryCategoryTileIssue:
  "Tile Issue",

inquiryCategoryOther:
  "Other",

inquiryDetailsQuestion:
  "Please enter the details.",

inquiryDetailsPlaceholder:
  "For Tile Issues, please include the coordinates in the details.",

inquiryContactQuestion:
  "(Optional) If you would like a reply from us, please provide your contact method with your contact information. (Optional)",

inquiryContactGame:
  "In-game name",

inquiryContactDiscord:
  "Discord",

inquiryContactTelegram:
  "Telegram",

inquiryContactKakao:
  "Kakao Open Profile",

inquiryContactEmail:
  "Email",

    inquiryContactLine:
  "LINE",

inquiryContactOther:
  "Other",

inquiryContactPairError:
  "Please select a contact method and enter your contact information.",

inquiryContactExample:
  "Example: In-game name: ᴬᶜᴱ⍣⃝ 레몬 / Discord: username / Telegram: @username / Kakao Open Profile: link / Email: address",

inquiryContactPlaceholder:
  "If the information is incorrect, you may not receive a reply.",

inquirySubmit:
  "Submit",

inquiryRequiredError:
  "Please complete all required fields.",

    sourceCode:
  "View source code",

    inquirySubmitSuccess:
  "Your inquiry has been submitted successfully.",

inquirySubmitError:
  "Failed to submit your inquiry.",

    inquiryClosed:
    "We are not accepting inquiries at this time.",
    
    groupBuyTitle:
  "Group Buy Application",

groupBuyIntro:
  "Please complete all required fields.",

groupBuyAlliance:
  "Alliance",

groupBuyPlayerName:
  "Player Name",

groupBuyNamePlaceholder:
  "Please enter your name by copy & paste 😉",

groupBuyPurchaseItems:
  "Items You Plan to Purchase",

groupBuyPurchaseItemsHelp:
  "Select at least one item and choose the quantity.",

groupBuyQuantity:
  "Qty",

groupBuyNoItems:
  "No purchase items are currently available.",

groupBuyAgreementPurchase:
  "If you participate, you must purchase at least one item. To avoid unexpected issues, please purchase your coupons in advance.",

groupBuyAgreementRestriction:
  "If you are found participating without making a purchase, you may be restricted from participating in future events.",

groupBuySubmit:
  "Submit",

groupBuySubmitting:
  "Submitting…",

groupBuySubmitSuccess:
  "Your application has been successfully submitted.",

groupBuyUpdateSuccess:
  "Your application has been successfully updated.",

groupBuySubmitFailed:
  "Submission failed.",

groupBuyLoadFailed:
  "Could not load group purchase data.",

groupBuySelect:
  "Select",

groupBuyRequired:
  "Please complete all required fields.",

groupBuySelectAtLeastOne:
  "Please select at least one item.",

groupBuyAgreementsRequired:
  "Please confirm both required agreements.",

groupBuyLoading:
  "Loading…",

groupBuyRecruitmentBefore:
  "Registration has not started yet.",

groupBuyRecruitmentOpen:
  "Registration is currently open.",

groupBuyRecruitmentClosed:
  "Registration has ended.",

groupBuyRecruitmentStarts:
  "Registration starts:",

groupBuyRecruitmentEnds:
  "Registration ends:",

    groupBuyApplication: 
      "Group Buy Application",

    staffTitle: "Staff",
staffLogin: "Staff Login",
email: "Email",
password: "Password",
login: "Login",
logout: "Logout",
signedInAs: "Signed in as",

changePassword: "Change Password",
changePasswordLead: "Change your Staff account password.",
newPassword: "New password",
confirmNewPassword: "Confirm new password",

staffTabImages: "Image Management",
staffTabWk: "WK Applications",
staffTabGroupBuy: "Group Purchase",

staffImageTitle: "Image Management",
staffImageLead:
  "Review uploaded images, remove inappropriate images, or block an uploader for 7 days.",

staffWkTitle: "WK Applications",
staffWkLead: "You can view WK applications.",

staffGroupBuyTitle: "Group Purchase",
staffGroupBuyLead:
  "Manage group purchase rounds and items, and view applications.",

delete: "Delete",
block7Days: "Block 7 days",
unblock: "Unblock",
notBlocked: "Not blocked",
blockedByAdmin: "Blocked by Admin",
noUploadsFound: "No uploads found.",

staffSigningIn: "Signing in…",
staffLoginRequired: "Enter your email and password.",
staffAccessDenied:
  "This account does not have active Staff access.",
staffVerifyFailed: "Could not verify Staff access.",
staffLoginFailed: "Login failed.",

passwordMin6: "Password must be at least 6 characters.",
passwordMismatch: "Passwords do not match.",
passwordChanging: "Changing password…",
passwordChanged: "Password changed.",
passwordChangeFailed: "Could not change password.",

staffSessionExpired: "Staff session expired.",
imageRequestFailed: "Image management request failed.",
imageLoading: "Loading…",
imageLoadFailed: "Could not load images.",
deleteImageConfirm: "Delete this image?",
deleteImageFailed: "Could not delete image.",
block7DaysConfirm: "Block this uploader for 7 days?",
blockFailed: "Could not block uploader.",
unblockConfirm: "Unblock this uploader?",
unblockFailed: "Could not unblock uploader.",
    blockedUntil: "Blocked until {date}",

    wkNoApplications: "No applications found.",
wkLoading: "Loading applications…",
wkLoadFailed: "Could not load WK applications.",
wkTotal: "{count} application(s)",
wkCycle: "Cycle {cycle}",
wkCycleUnknown: "Unassigned cycle",

wkTier: "Tier",
wkTroopType: "Troop Type",
wkTroopSize: "Troop Size",
wkRallySize: "Rally Size",
wkStatus: "Status",
wkSubmitted: "Submitted",
wkLanguage: "Language",

wkFighter: "Fighter",
wkShooter: "Shooter",
wkRider: "Rider",
wkAllStrong: "All strong",

wkMonitorAvailable: "Real-time monitoring available",
wkMonitorUnavailable: "Real-time monitoring unavailable",

wkCaptain: "Captain",
wkSubCaptain: "Subcaptain",
wkRegular: "Regular Participant",
wkNegotiable: "Negotiable",

wkFirstHalf: "First Half",
wkSecondHalf: "Second Half",
wkFull: "Full",

groupBuyRounds:
  "Rounds",

groupBuyCreateRound:
  "Create Round",

groupBuyRoundName:
  "Round name",

groupBuyStart:
  "Start",

groupBuyEnd:
  "End",

groupBuyActive:
  "Active",

groupBuyInactive:
  "Inactive",

groupBuyAddRound:
  "Add Round",

groupBuySelectedRound:
  "Selected Round",

groupBuyItems:
  "Purchase Items",

groupBuyItemName:
  "Item name",

groupBuyMaxQuantity:
  "Max quantity",

groupBuyAddItem:
  "Add Item",

groupBuyApplications:
  "Applications",

groupBuyApplicationsReadOnly:
  "Applications are read-only.",

groupBuyRequestFailed:
  "Group purchase request failed.",

groupBuyDetailFailed:
  "Could not load round details.",

groupBuyNoRounds:
  "No rounds found.",

groupBuySelectRound:
  "Select a round.",

groupBuyManage:
  "Manage",

groupBuySetActive:
  "Set Active",

groupBuySetInactive:
  "Set Inactive",

groupBuyEdit:
  "Edit",

groupBuyStartKst:
  "Start (KST, YYYY-MM-DDTHH:MM):",

groupBuyEndKst:
  "End (KST, YYYY-MM-DDTHH:MM):",

groupBuyInvalidRound:
  "Enter a valid round name, start time, and end time.",

groupBuyOverlap:
  "The active period overlaps with another active round.",

groupBuyDeleteItemConfirm:
  "Delete this purchase item?",

groupBuyItemInUse:
  "This item cannot be deleted because it has already been used in an application.",

groupBuyNoApplications:
  "No applications found.",

groupBuyNoItemsSelected:
  "No items selected.",

groupBuyTotalApplications:
  "{count} application(s)",

groupBuySelectRoundFirst:
  "Select a round first.",

groupBuyInvalidItem:
  "Enter a valid item name and maximum quantity.",
  },

  ko: {
    language: "언어",

    headline:
      "서로 다른 언어, 하나의 서버.",

    tagline:
      "편안하게, 자유롭게, 함께 연결되어.",

    inquiry:
      "열린 의견함",

    wkApplication:
      "황무지 신청",

    imageUpload:
      "이미지 업로드",

    viewImages:
      "이미지 확인",

    unofficial:
      "967 서버의 비공식 커뮤니티 사이트입니다.",

    themeSystem:
      "시스템",

    themeLight:
      "라이트",

    themeDark:
      "다크",
    
uploadTitle:
  "이미지 업로드",

uploadLead:
  "스크린샷을 업로드하세요.<br>PNG, JPG, JPEG · 이미지당 최대 5 MB · 최대 3장",

uploadNotice:
  "<strong>업로드된 이미지는 공개되며 누구나 볼 수 있습니다.</strong><br>개인정보나 민감한 정보가 포함된 이미지는 업로드하지 마세요.<br>오래된 이미지는 주기적으로 삭제될 수 있습니다.<br><strong>이미지를 업로드하면 해당 이미지가 공개적으로 열람되는 것에 동의한 것으로 간주됩니다.</strong>",

chooseImages:
  "이미지 최대 3장 선택",

uploadImages:
  "이미지 업로드",

uploadLimit:
  "제한: 동일 네트워크에서 24시간당 최대 8장까지 업로드할 수 있습니다.",

uploadComplete:
  "업로드 완료",

uploadSuccess:
  "이미지가 정상적으로 접수되었습니다.",

backHome:
  "← 홈으로 돌아가기",

onlyImagesAllowed:
  "PNG, JPG, JPEG 이미지만 업로드할 수 있습니다.",

imageTooLarge:
  "각 이미지는 5 MB 이하여야 합니다.",

tooManyImages:
  "이미지는 최대 3장까지 선택할 수 있습니다.",

uploading:
  "업로드 중…",

uploadFailed:
  "업로드에 실패했습니다.",

    galleryLead:
  "커뮤니티에서 업로드한 이미지입니다.",

refresh:
  "새로고침",

loadingImages:
  "이미지를 불러오는 중…",

    galleryLoadFailed:
  "갤러리를 불러올 수 없습니다.",

galleryEmpty:
  "아직 업로드된 이미지가 없습니다.",

communityUpload:
  "커뮤니티 업로드 이미지",

    inquiryFormTitle:
  "안녕하세요!",

inquiryCategoryQuestion:
  "어떤 이유로 찾아오셨나요?",

inquiryCategorySuggestion:
  "건의",

inquiryCategoryReport:
  "신고",

inquiryCategoryInquiry:
  "문의 (이민 포함)",

inquiryCategoryTileIssue:
  "채집지 문제",

inquiryCategoryOther:
  "기타",

inquiryDetailsQuestion:
  "내용을 입력해주세요.",

inquiryDetailsPlaceholder:
  "채집지 문제의 경우, 내용에 좌표를 포함해주세요.",

inquiryContactQuestion:
  "(선택) 답신을 원하시는 경우, 연락 가능한 수단과 연락처를 함께 입력해주세요. (선택)",

inquiryContactGame:
  "게임 닉네임",

inquiryContactDiscord:
  "디스코드",

inquiryContactTelegram:
  "텔레그램",

inquiryContactKakao:
  "카카오 오픈 프로필",

inquiryContactEmail:
  "Email",

    inquiryContactLine:
  "라인",

inquiryContactOther:
  "기타",

inquiryContactPairError:
  "연락처 종류를 선택하고 연락처를 입력해주세요.",

inquiryContactExample:
  "예: 게임 닉네임: ᴬᶜᴱ⍣⃝ 레몬 / Discord: username / Telegram: @username / Kakao Open Profile: 링크 / Email: 주소",

inquiryContactPlaceholder:
  "부정확한 경우 답신을 받지 못할 수 있습니다.",

inquirySubmit:
  "제출",

inquiryRequiredError:
  "필수 항목을 모두 입력해주세요.",

    sourceCode:
  "소스 코드 보기",

    inquirySubmitSuccess:
  "문의가 성공적으로 접수되었습니다.",

inquirySubmitError:
  "문의 제출에 실패했습니다.",

    inquiryClosed:
    "현재 문의를 받지 않고 있습니다.",
    
    groupBuyTitle:
  "공동구매 신청",

groupBuyIntro:
  "필수 항목을 모두 작성해 주세요.",

groupBuyAlliance:
  "연맹",

groupBuyPlayerName:
  "이름",

groupBuyNamePlaceholder:
  "반드시 복사붙이기로 입력해주세요😉",

groupBuyPurchaseItems:
  "구매 예정 항목",

groupBuyPurchaseItemsHelp:
  "최소 1개 이상의 항목을 선택하고 수량을 선택해 주세요.",

groupBuyQuantity:
  "수량",

groupBuyNoItems:
  "현재 선택 가능한 구매 항목이 없습니다.",

groupBuyAgreementPurchase:
  "참여할 경우 반드시 하나 이상의 상품을 구매해야 합니다. 예상치 못한 문제를 피하기 위해 쿠폰은 미리 구매해 두시기 바랍니다.",

groupBuyAgreementRestriction:
  "구매하지 않고 참여한 사실이 확인될 경우 향후 참여가 제한될 수 있습니다.",

groupBuySubmit:
  "제출",

groupBuySubmitting:
  "제출 중…",

groupBuySubmitSuccess:
  "신청이 성공적으로 제출되었습니다.",

groupBuyUpdateSuccess:
  "기존 신청 내용이 성공적으로 수정되었습니다.",

groupBuySubmitFailed:
  "제출에 실패했습니다.",

groupBuyLoadFailed:
  "공동구매 데이터를 불러올 수 없습니다.",

groupBuySelect:
  "선택",

groupBuyRequired:
  "필수 항목을 모두 작성해 주세요.",

groupBuySelectAtLeastOne:
  "구매 예정 항목을 최소 1개 이상 선택해 주세요.",

groupBuyAgreementsRequired:
  "필수 확인 사항에 모두 동의해 주세요.",

groupBuyLoading:
  "불러오는 중…",

groupBuyRecruitmentBefore:
  "아직 신청 기간이 아닙니다.",

groupBuyRecruitmentOpen:
  "현재 공동구매 신청을 받고 있습니다.",

groupBuyRecruitmentClosed:
  "공동구매 신청이 종료되었습니다.",

groupBuyRecruitmentStarts:
  "신청 시작:",

groupBuyRecruitmentEnds:
  "신청 마감:",

   groupBuyApplication: 
     "공동구매 신청", 

staffTitle: "스태프",
staffLogin: "스태프 로그인",
email: "이메일",
password: "비밀번호",
login: "로그인",
logout: "로그아웃",
signedInAs: "로그인 계정",

changePassword: "비밀번호 변경",
changePasswordLead: "스태프 계정의 비밀번호를 변경합니다.",
newPassword: "새 비밀번호",
confirmNewPassword: "새 비밀번호 확인",

staffTabImages: "이미지 관리",
staffTabWk: "황무지 신청",
staffTabGroupBuy: "공동구매",

staffImageTitle: "이미지 관리",
staffImageLead:
  "업로드된 이미지를 확인하고, 이미지를 삭제하거나 업로더를 7일간 차단할 수 있습니다.",

staffWkTitle: "황무지 신청",
staffWkLead: "황무지 신청 목록을 조회할 수 있습니다.",

staffGroupBuyTitle: "공동구매",
staffGroupBuyLead:
  "공동구매 회차와 구매항목을 관리하고 신청내역을 확인할 수 있습니다.",

delete: "삭제",
block7Days: "7일 차단",
unblock: "차단 해제",
notBlocked: "차단되지 않음",
blockedByAdmin: "관리자가 차단함",
noUploadsFound: "업로드 내역이 없습니다.",

staffSigningIn: "로그인 중…",
staffLoginRequired: "이메일과 비밀번호를 입력하세요.",
staffAccessDenied: "활성화된 스태프 권한이 없는 계정입니다.",
staffVerifyFailed: "스태프 권한을 확인할 수 없습니다.",
staffLoginFailed: "로그인에 실패했습니다.",

passwordMin6: "비밀번호는 6자 이상이어야 합니다.",
passwordMismatch: "비밀번호가 일치하지 않습니다.",
passwordChanging: "비밀번호 변경 중…",
passwordChanged: "비밀번호가 변경되었습니다.",
passwordChangeFailed: "비밀번호를 변경할 수 없습니다.",

staffSessionExpired: "스태프 로그인 세션이 만료되었습니다.",
imageRequestFailed: "이미지 관리 요청에 실패했습니다.",
imageLoading: "불러오는 중…",
imageLoadFailed: "이미지를 불러올 수 없습니다.",
deleteImageConfirm: "이 이미지를 삭제하시겠습니까?",
deleteImageFailed: "이미지를 삭제할 수 없습니다.",
block7DaysConfirm: "이 업로더를 7일간 차단하시겠습니까?",
blockFailed: "업로더를 차단할 수 없습니다.",
unblockConfirm: "이 업로더의 차단을 해제하시겠습니까?",
unblockFailed: "차단을 해제할 수 없습니다.",
    blockedUntil: "{date}까지 차단됨",

    wkNoApplications: "신청 내역이 없습니다.",
wkLoading: "신청 내역을 불러오는 중…",
wkLoadFailed: "황무지 신청 내역을 불러올 수 없습니다.",
wkTotal: "총 {count}건",
wkCycle: "{cycle}회차",
wkCycleUnknown: "회차 미지정",

wkTier: "티어",
wkTroopType: "병종",
wkTroopSize: "부대",
wkRallySize: "집결",
wkStatus: "상태",
wkSubmitted: "신청",
wkLanguage: "언어",

wkFighter: "용사",
wkShooter: "슈터",
wkRider: "기수",
wkAllStrong: "전 병종 강함",

wkMonitorAvailable: "실시간 모니터링 및 대응 가능",
wkMonitorUnavailable: "실시간 모니터링 불가",

wkCaptain: "캡틴 가능",
wkSubCaptain: "서브캡틴 가능",
wkRegular: "일반 참가",
wkNegotiable: "필요 시 협의 가능",

wkFirstHalf: "전반부",
wkSecondHalf: "후반부",
wkFull: "전체",

groupBuyRounds:
  "회차 관리",

groupBuyCreateRound:
  "회차 추가",

groupBuyRoundName:
  "회차명",

groupBuyStart:
  "모집 시작",

groupBuyEnd:
  "모집 종료",

groupBuyActive:
  "활성",

groupBuyInactive:
  "비활성",

groupBuyAddRound:
  "회차 추가",

groupBuySelectedRound:
  "선택된 회차",

groupBuyItems:
  "구매항목 관리",

groupBuyItemName:
  "구매항목명",

groupBuyMaxQuantity:
  "최대 수량",

groupBuyAddItem:
  "구매항목 추가",

groupBuyApplications:
  "신청내역",

groupBuyApplicationsReadOnly:
  "신청내역은 조회만 가능합니다.",

groupBuyRequestFailed:
  "공동구매 요청에 실패했습니다.",

groupBuyDetailFailed:
  "회차 상세정보를 불러올 수 없습니다.",

groupBuyNoRounds:
  "등록된 회차가 없습니다.",

groupBuySelectRound:
  "회차를 선택하세요.",

groupBuyManage:
  "관리",

groupBuySetActive:
  "활성화",

groupBuySetInactive:
  "비활성화",

groupBuyEdit:
  "수정",

groupBuyStartKst:
  "모집 시작 (KST, YYYY-MM-DDTHH:MM):",

groupBuyEndKst:
  "모집 종료 (KST, YYYY-MM-DDTHH:MM):",

groupBuyInvalidRound:
  "회차명과 모집 시작·종료 일시를 정확히 입력하세요.",

groupBuyOverlap:
  "다른 활성 회차와 모집기간이 겹칩니다.",

groupBuyDeleteItemConfirm:
  "이 구매항목을 삭제하시겠습니까?",

groupBuyItemInUse:
  "이미 신청내역에서 사용된 구매항목은 삭제할 수 없습니다.",

groupBuyNoApplications:
  "신청내역이 없습니다.",

groupBuyNoItemsSelected:
  "선택한 구매항목이 없습니다.",

groupBuyTotalApplications:
  "총 {count}건",

groupBuySelectRoundFirst:
  "먼저 회차를 선택하세요.",

groupBuyInvalidItem:
  "구매항목명과 최대 수량을 정확히 입력하세요.",

  },

  ja: {
    language: "言語",

    headline:
      "異なる言語、ひとつのサーバー。",

    tagline:
      "穏やかに、自由に、つながろう。",

    inquiry:
      "匿名ご意見・通報",

    wkApplication:
      "荒野申請",

    imageUpload:
      "画像アップロード",

    viewImages:
      "画像を見る",

    unofficial:
      "State 967の非公式コミュニティサイトです。",

    themeSystem:
      "システム",

    themeLight:
      "ライト",

    themeDark:
      "ダーク",

uploadTitle:
  "画像アップロード",

uploadLead:
  "スクリーンショットをアップロードしてください。<br>PNG, JPG, JPEG · 1枚につき最大5 MB · 最大3枚",

uploadNotice:
  "<strong>アップロードされた画像は公開され、誰でも閲覧できます。</strong><br>個人情報や機密情報を含む画像はアップロードしないでください。<br>古い画像は定期的に削除される場合があります。<br><strong>画像をアップロードすることで、その画像が一般公開されることに同意したものとみなされます。</strong>",

chooseImages:
  "画像を最大3枚選択",

uploadImages:
  "画像をアップロード",

uploadLimit:
  "制限：同一ネットワークから24時間につき最大8枚までアップロードできます。",

uploadComplete:
  "アップロード完了",

uploadSuccess:
  "画像を正常に受け付けました。",

backHome:
  "← ホームに戻る",

onlyImagesAllowed:
  "PNG、JPG、JPEG画像のみアップロードできます。",

imageTooLarge:
  "各画像は5 MB以下にしてください。",

tooManyImages:
  "画像は最大3枚まで選択できます。",

uploading:
  "アップロード中…",

uploadFailed:
  "アップロードに失敗しました。",

    galleryLead:
  "コミュニティによってアップロードされた画像です。",

refresh:
  "更新",

loadingImages:
  "画像を読み込んでいます…",

    galleryLoadFailed:
  "ギャラリーを読み込めませんでした。",

galleryEmpty:
  "まだ画像はアップロードされていません。",

communityUpload:
  "コミュニティのアップロード画像",

    inquiryFormTitle:
  "こんにちは！",

inquiryCategoryQuestion:
  "どのような理由でこちらに来られましたか？",

inquiryCategorySuggestion:
  "提案・要望",

inquiryCategoryReport:
  "通報",

inquiryCategoryInquiry:
  "お問い合わせ（移民を含む）",

inquiryCategoryTileIssue:
  "タイルの問題",

inquiryCategoryOther:
  "その他",

inquiryDetailsQuestion:
  "内容をご入力ください。",

inquiryDetailsPlaceholder:
  "タイルの問題の場合は、内容に座標を含めてください。",

inquiryContactQuestion:
  "（任意）こちらからの返信をご希望の場合は、連絡可能な方法・連絡先をご入力ください。（任意）",

inquiryContactGame:
  "ゲーム内ニックネーム",

inquiryContactDiscord:
  "Discord",

inquiryContactTelegram:
  "Telegram",

inquiryContactKakao:
  "Kakao Open Profile",

inquiryContactEmail:
  "Email",

    inquiryContactLine:
  "LINE",

inquiryContactOther:
  "その他",

inquiryContactPairError:
  "連絡方法を選択し、連絡先をご入力ください。",

inquiryContactExample:
  "例：ゲーム内ニックネーム: ᴬᶜᴱ⍣⃝ 레몬 / Discord: username / Telegram: @username / Kakao Open Profile: リンク / Email: アドレス",

inquiryContactPlaceholder:
  "情報が正確でない場合、返信を受け取れない可能性があります。",

inquirySubmit:
  "送信",

inquiryRequiredError:
  "必須項目をすべて入力してください。",

    sourceCode:
  "ソースコードを見る",

    inquirySubmitSuccess:
  "お問い合わせを受け付けました。",

inquirySubmitError:
  "お問い合わせの送信に失敗しました。",

    inquiryClosed:
    "現在、お問い合わせの受付を停止しています。",
    
    groupBuyTitle:
  "共同購入申請",

groupBuyIntro:
  "必須項目をすべて入力してください。",

groupBuyAlliance:
  "ギルド",

groupBuyPlayerName:
  "名前",

groupBuyNamePlaceholder:
  "必ずコピー＆ペーストで入力してください😉",

groupBuyPurchaseItems:
  "購入予定の商品",

groupBuyPurchaseItemsHelp:
  "1つ以上の商品を選択し、数量を選んでください。",

groupBuyQuantity:
  "数量",

groupBuyNoItems:
  "現在選択できる商品はありません。",

groupBuyAgreementPurchase:
  "参加する場合は、必ず1つ以上の商品を購入してください。予期せぬ問題を避けるため、クーポンは事前に購入しておくことをおすすめします。",

groupBuyAgreementRestriction:
  "商品を購入せずに参加したことが確認された場合、今後の参加が制限される可能性があります。",

groupBuySubmit:
  "送信",

groupBuySubmitting:
  "送信中…",

groupBuySubmitSuccess:
  "申請が正常に送信されました。",

groupBuyUpdateSuccess:
  "申請内容が正常に更新されました。",

groupBuySubmitFailed:
  "送信に失敗しました。",

groupBuyLoadFailed:
  "共同購入データを読み込めませんでした。",

groupBuySelect:
  "選択",

groupBuyRequired:
  "必須項目をすべて入力してください。",

groupBuySelectAtLeastOne:
  "購入予定の商品を1つ以上選択してください。",

groupBuyAgreementsRequired:
  "必須の確認事項すべてに同意してください。",

groupBuyLoading:
  "読み込み中…",

groupBuyRecruitmentBefore:
  "まだ申請期間ではありません。",

groupBuyRecruitmentOpen:
  "現在、共同購入の申請を受け付けています。",

groupBuyRecruitmentClosed:
  "共同購入の申請受付は終了しました。",

groupBuyRecruitmentStarts:
  "申請開始：",

groupBuyRecruitmentEnds:
  "申請締切：",

    groupBuyApplication: 
      "共同購入申請",

    staffTitle: "スタッフ",
staffLogin: "スタッフログイン",
email: "メールアドレス",
password: "パスワード",
login: "ログイン",
logout: "ログアウト",
signedInAs: "ログイン中",

changePassword: "パスワード変更",
changePasswordLead: "スタッフアカウントのパスワードを変更します。",
newPassword: "新しいパスワード",
confirmNewPassword: "新しいパスワードを確認",

staffTabImages: "画像管理",
staffTabWk: "荒野申請",
staffTabGroupBuy: "共同購入",

staffImageTitle: "画像管理",
staffImageLead:
  "アップロードされた画像の確認、削除、アップロード者の7日間のブロックができます。",

staffWkTitle: "荒野申請",
staffWkLead: "荒野申請の一覧を確認できます。",

staffGroupBuyTitle: "共同購入",
staffGroupBuyLead:
  "共同購入の回次と購入項目を管理し、申請内容を確認できます。",

delete: "削除",
block7Days: "7日間ブロック",
unblock: "ブロック解除",
notBlocked: "ブロックなし",
blockedByAdmin: "管理者によるブロック",
noUploadsFound: "アップロードはありません。",

staffSigningIn: "ログイン中…",
staffLoginRequired: "メールアドレスとパスワードを入力してください。",
staffAccessDenied: "有効なスタッフ権限がありません。",
staffVerifyFailed: "スタッフ権限を確認できませんでした。",
staffLoginFailed: "ログインに失敗しました。",

passwordMin6: "パスワードは6文字以上にしてください。",
passwordMismatch: "パスワードが一致しません。",
passwordChanging: "パスワードを変更しています…",
passwordChanged: "パスワードを変更しました。",
passwordChangeFailed: "パスワードを変更できませんでした。",

staffSessionExpired: "スタッフのログインセッションが期限切れです。",
imageRequestFailed: "画像管理リクエストに失敗しました。",
imageLoading: "読み込み中…",
imageLoadFailed: "画像を読み込めませんでした。",
deleteImageConfirm: "この画像を削除しますか？",
deleteImageFailed: "画像を削除できませんでした。",
block7DaysConfirm: "このアップロード者を7日間ブロックしますか？",
blockFailed: "アップロード者をブロックできませんでした。",
unblockConfirm: "このアップロード者のブロックを解除しますか？",
unblockFailed: "ブロックを解除できませんでした。",
blockedUntil: "{date}までブロック中",

wkNoApplications: "申請はありません。",
wkLoading: "申請を読み込んでいます…",
wkLoadFailed: "荒野申請を読み込めませんでした。",
wkTotal: "合計 {count} 件",
wkCycle: "第{cycle}回",
wkCycleUnknown: "回次未指定",

wkTier: "ティア",
wkTroopType: "兵種",
wkTroopSize: "部隊規模",
wkRallySize: "集結規模",
wkStatus: "状態",
wkSubmitted: "申請",
wkLanguage: "言語",

wkFighter: "ファイター",
wkShooter: "シューター",
wkRider: "ライダー",
wkAllStrong: "全兵種",

wkMonitorAvailable: "リアルタイム対応可能",
wkMonitorUnavailable: "リアルタイム対応不可",

wkCaptain: "キャプテン可能",
wkSubCaptain: "サブキャプテン可能",
wkRegular: "一般参加",
wkNegotiable: "必要に応じて相談可能",

wkFirstHalf: "前半",
wkSecondHalf: "後半",
wkFull: "全時間",

groupBuyRounds:
  "回次管理",

groupBuyCreateRound:
  "回次を追加",

groupBuyRoundName:
  "回次名",

groupBuyStart:
  "募集開始",

groupBuyEnd:
  "募集終了",

groupBuyActive:
  "有効",

groupBuyInactive:
  "無効",

groupBuyAddRound:
  "回次を追加",

groupBuySelectedRound:
  "選択中の回次",

groupBuyItems:
  "購入項目管理",

groupBuyItemName:
  "購入項目名",

groupBuyMaxQuantity:
  "最大数量",

groupBuyAddItem:
  "購入項目を追加",

groupBuyApplications:
  "申請一覧",

groupBuyApplicationsReadOnly:
  "申請内容は閲覧のみ可能です。",

groupBuyRequestFailed:
  "共同購入のリクエストに失敗しました。",

groupBuyDetailFailed:
  "回次の詳細情報を読み込めませんでした。",

groupBuyNoRounds:
  "登録された回次はありません。",

groupBuySelectRound:
  "回次を選択してください。",

groupBuyManage:
  "管理",

groupBuySetActive:
  "有効にする",

groupBuySetInactive:
  "無効にする",

groupBuyEdit:
  "編集",

groupBuyStartKst:
  "募集開始（KST、YYYY-MM-DDTHH:MM）：",

groupBuyEndKst:
  "募集終了（KST、YYYY-MM-DDTHH:MM）：",

groupBuyInvalidRound:
  "回次名と募集開始・終了日時を正しく入力してください。",

groupBuyOverlap:
  "他の有効な回次と募集期間が重複しています。",

groupBuyDeleteItemConfirm:
  "この購入項目を削除しますか？",

groupBuyItemInUse:
  "すでに申請で使用されている購入項目は削除できません。",

groupBuyNoApplications:
  "申請はありません。",

groupBuyNoItemsSelected:
  "選択された購入項目はありません。",

groupBuyTotalApplications:
  "合計 {count} 件",

groupBuySelectRoundFirst:
  "先に回次を選択してください。",

groupBuyInvalidItem:
  "購入項目名と最大数量を正しく入力してください。",

  },

  ru: {
    language: "Язык",

    headline:
      "Разные языки. Один сервер.",

    tagline:
      "Свободно, открыто, вместе.",

    inquiry:
      "Открытая обратная связь",

    wkApplication:
      "Заявка на WK",

    imageUpload:
      "Загрузить изображения",

    viewImages:
      "Просмотреть изображения",

    unofficial:
      "Неофициальный сайт сообщества State 967.",

    themeSystem:
      "Системная",

    themeLight:
      "Светлая",

    themeDark:
      "Тёмная",
   
uploadTitle:
  "Загрузка изображений",

uploadLead:
  "Загрузите скриншоты.<br>PNG, JPG, JPEG · до 5 МБ на файл · не более 3 изображений",

uploadNotice:
  "<strong>Загруженные изображения являются общедоступными и могут быть просмотрены любым пользователем.</strong><br>Не загружайте изображения, содержащие личную или конфиденциальную информацию.<br>Старые изображения могут периодически удаляться.<br><strong>Загружая изображения, вы подтверждаете своё согласие на их публичную доступность.</strong>",

chooseImages:
  "Выбрать до 3 изображений",

uploadImages:
  "Загрузить изображения",

uploadLimit:
  "Ограничение: до 8 изображений за 24 часа из одной сети.",

uploadComplete:
  "Загрузка завершена",

uploadSuccess:
  "Изображения успешно получены.",

backHome:
  "← На главную",

onlyImagesAllowed:
  "Разрешены только изображения PNG, JPG и JPEG.",

imageTooLarge:
  "Размер каждого изображения не должен превышать 5 МБ.",

tooManyImages:
  "Можно выбрать не более 3 изображений.",

uploading:
  "Загрузка…",

uploadFailed:
  "Не удалось загрузить изображения.",

    galleryLead:
  "Изображения, загруженные сообществом.",

refresh:
  "Обновить",

loadingImages:
  "Загрузка изображений…",

    galleryLoadFailed:
  "Не удалось загрузить галерею.",

galleryEmpty:
  "Изображения пока не загружены.",

communityUpload:
  "Изображение сообщества",

    inquiryFormTitle:
  "Здравствуйте!",

inquiryCategoryQuestion:
  "Что привело вас сюда?",

inquiryCategorySuggestion:
  "Предложение",

inquiryCategoryReport:
  "Сообщение о нарушении",

inquiryCategoryInquiry:
  "Вопросы (включая иммиграцию)",

inquiryCategoryTileIssue:
  "Проблема с местом сбора",

inquiryCategoryOther:
  "Другое",

inquiryDetailsQuestion:
  "Пожалуйста, опишите подробности.",

inquiryDetailsPlaceholder:
  "Если проблема связана с местом сбора, укажите координаты в описании.",

inquiryContactQuestion:
  "(Необязательно) Если вы хотите получить от нас ответ, укажите удобный способ связи и контактные данные. (Необязательно)",

inquiryContactGame:
  "Игровой ник",

inquiryContactDiscord:
  "Discord",

inquiryContactTelegram:
  "Telegram",

inquiryContactKakao:
  "Kakao Open Profile",

inquiryContactEmail:
  "Email",

    inquiryContactLine:
  "LINE",

inquiryContactOther:
  "Другое",

inquiryContactPairError:
  "Выберите способ связи и укажите контактные данные.",

inquiryContactExample:
  "Например: Игровой ник: ᴬᶜᴱ⍣⃝ 레몬 / Discord: username / Telegram: @username / Kakao Open Profile: ссылка / Email: адрес",

inquiryContactPlaceholder:
  "Если информация указана неверно, вы можете не получить ответ. ",

inquirySubmit:
  "Отправить",

inquiryRequiredError:
  "Пожалуйста, заполните все обязательные поля.",

    sourceCode:
  "Посмотреть исходный код",

    inquirySubmitSuccess:
  "Ваше обращение успешно отправлено.",

inquirySubmitError:
  "Не удалось отправить обращение.",

      inquiryClosed:
    "В настоящее время мы не принимаем обращения.",
    
    groupBuyTitle:
  "Заявка на совместную покупку",

groupBuyIntro:
  "Заполните все обязательные поля.",

groupBuyAlliance:
  "Альянс",

groupBuyPlayerName:
  "Ник",

groupBuyNamePlaceholder:
  "Обязательно скопируйте и вставьте ник 😉",

groupBuyPurchaseItems:
  "Планируемые покупки",

groupBuyPurchaseItemsHelp:
  "Выберите хотя бы один товар и укажите количество.",

groupBuyQuantity:
  "Кол-во",

groupBuyNoItems:
  "В настоящее время нет доступных товаров для выбора.",

groupBuyAgreementPurchase:
  "Для участия необходимо приобрести как минимум один товар. Чтобы избежать непредвиденных проблем, рекомендуется приобрести купоны заранее.",

groupBuyAgreementRestriction:
  "Если будет установлено, что вы участвовали без покупки, ваше участие в будущих мероприятиях может быть ограничено.",

groupBuySubmit:
  "Отправить",

groupBuySubmitting:
  "Отправка…",

groupBuySubmitSuccess:
  "Заявка успешно отправлена.",

groupBuyUpdateSuccess:
  "Ваша заявка успешно обновлена.",

groupBuySubmitFailed:
  "Не удалось отправить заявку.",

groupBuyLoadFailed:
  "Не удалось загрузить данные совместной покупки.",

groupBuySelect:
  "Выберите",

groupBuyRequired:
  "Заполните все обязательные поля.",

groupBuySelectAtLeastOne:
  "Выберите как минимум один товар.",

groupBuyAgreementsRequired:
  "Подтвердите оба обязательных условия.",

groupBuyLoading:
  "Загрузка…",

groupBuyRecruitmentBefore:
  "Период подачи заявок ещё не начался.",

groupBuyRecruitmentOpen:
  "Приём заявок на совместную покупку открыт.",

groupBuyRecruitmentClosed:
  "Приём заявок на совместную покупку завершён.",

groupBuyRecruitmentStarts:
  "Начало приёма заявок:",

groupBuyRecruitmentEnds:
  "Окончание приёма заявок:",

   groupBuyApplication: 
     "Совместная покупка", 

    staffTitle: "Персонал",
staffLogin: "Вход для персонала",
email: "Электронная почта",
password: "Пароль",
login: "Войти",
logout: "Выйти",
signedInAs: "Вы вошли как",

changePassword: "Изменить пароль",
changePasswordLead: "Измените пароль своей учётной записи персонала.",
newPassword: "Новый пароль",
confirmNewPassword: "Подтвердите новый пароль",

staffTabImages: "Управление изображениями",
staffTabWk: "Заявки на WK",
staffTabGroupBuy: "Совместная покупка",

staffImageTitle: "Управление изображениями",
staffImageLead:
  "Просматривайте и удаляйте загруженные изображения или блокируйте загрузившего их пользователя на 7 дней.",

staffWkTitle: "Заявки на WK",
staffWkLead: "Здесь можно просматривать заявки на WK.",

staffGroupBuyTitle: "Совместная покупка",
staffGroupBuyLead:
  "Управляйте раундами и товарами совместной покупки и просматривайте заявки.",

delete: "Удалить",
block7Days: "Блокировать на 7 дней",
unblock: "Разблокировать",
notBlocked: "Не заблокирован",
blockedByAdmin: "Заблокирован администратором",
noUploadsFound: "Загрузок нет.",

staffSigningIn: "Вход…",
staffLoginRequired: "Введите электронную почту и пароль.",
staffAccessDenied: "У этой учётной записи нет активного доступа персонала.",
staffVerifyFailed: "Не удалось проверить права персонала.",
staffLoginFailed: "Не удалось войти.",

passwordMin6: "Пароль должен содержать не менее 6 символов.",
passwordMismatch: "Пароли не совпадают.",
passwordChanging: "Изменение пароля…",
passwordChanged: "Пароль изменён.",
passwordChangeFailed: "Не удалось изменить пароль.",

staffSessionExpired: "Сеанс персонала истёк.",
imageRequestFailed: "Не удалось выполнить запрос управления изображениями.",
imageLoading: "Загрузка…",
imageLoadFailed: "Не удалось загрузить изображения.",
deleteImageConfirm: "Удалить это изображение?",
deleteImageFailed: "Не удалось удалить изображение.",
block7DaysConfirm: "Заблокировать этого пользователя на 7 дней?",
blockFailed: "Не удалось заблокировать пользователя.",
unblockConfirm: "Разблокировать этого пользователя?",
unblockFailed: "Не удалось снять блокировку.",
blockedUntil: "Заблокирован до {date}",

wkNoApplications: "Заявок нет.",
wkLoading: "Загрузка заявок…",
wkLoadFailed: "Не удалось загрузить заявки WK.",
wkTotal: "Всего заявок: {count}",
wkCycle: "Раунд {cycle}",
wkCycleUnknown: "Раунд не указан",

wkTier: "Тир",
wkTroopType: "Тип войск",
wkTroopSize: "Размер отряда",
wkRallySize: "Размер групповой атаки",
wkStatus: "Статус",
wkSubmitted: "Заявка",
wkLanguage: "Язык",

wkFighter: "Боец",
wkShooter: "Стрелок",
wkRider: "Наездник",
wkAllStrong: "Все типы войск",

wkMonitorAvailable: "Могу находиться онлайн",
wkMonitorUnavailable: "Не могу находиться онлайн",

wkCaptain: "Могу быть командиром",
wkSubCaptain: "Могу быть заместителем командира",
wkRegular: "Обычный участник",
wkNegotiable: "Можно обсудить",

wkFirstHalf: "Первые 4 часа",
wkSecondHalf: "Последние 4 часа",
wkFull: "Полностью",

    groupBuyRounds:
  "Управление раундами",

groupBuyCreateRound:
  "Создать раунд",

groupBuyRoundName:
  "Название раунда",

groupBuyStart:
  "Начало приёма",

groupBuyEnd:
  "Окончание приёма",

groupBuyActive:
  "Активен",

groupBuyInactive:
  "Неактивен",

groupBuyAddRound:
  "Добавить раунд",

groupBuySelectedRound:
  "Выбранный раунд",

groupBuyItems:
  "Управление товарами",

groupBuyItemName:
  "Название товара",

groupBuyMaxQuantity:
  "Максимальное количество",

groupBuyAddItem:
  "Добавить товар",

groupBuyApplications:
  "Заявки",

groupBuyApplicationsReadOnly:
  "Заявки доступны только для просмотра.",

groupBuyRequestFailed:
  "Не удалось выполнить запрос совместной покупки.",

groupBuyDetailFailed:
  "Не удалось загрузить информацию о раунде.",

groupBuyNoRounds:
  "Раундов нет.",

groupBuySelectRound:
  "Выберите раунд.",

groupBuyManage:
  "Управление",

groupBuySetActive:
  "Активировать",

groupBuySetInactive:
  "Деактивировать",

groupBuyEdit:
  "Изменить",

groupBuyStartKst:
  "Начало приёма (KST, YYYY-MM-DDTHH:MM):",

groupBuyEndKst:
  "Окончание приёма (KST, YYYY-MM-DDTHH:MM):",

groupBuyInvalidRound:
  "Укажите корректное название раунда, время начала и окончания.",

groupBuyOverlap:
  "Период пересекается с другим активным раундом.",

groupBuyDeleteItemConfirm:
  "Удалить этот товар?",

groupBuyItemInUse:
  "Этот товар нельзя удалить, поскольку он уже использован в заявке.",

groupBuyNoApplications:
  "Заявок нет.",

groupBuyNoItemsSelected:
  "Товары не выбраны.",

groupBuyTotalApplications:
  "Всего заявок: {count}",

groupBuySelectRoundFirst:
  "Сначала выберите раунд.",

groupBuyInvalidItem:
  "Укажите корректное название товара и максимальное количество.",
  },
};


function getBrowserLanguage() {
  const language =
    (
      navigator.language ||
      navigator.userLanguage ||
      "en"
    ).toLowerCase();

  if (language.startsWith("ko")) {
    return "ko";
  }

  if (language.startsWith("ja")) {
    return "ja";
  }

  if (language.startsWith("ru")) {
    return "ru";
  }

  return "en";
}


function getSavedLanguage() {
  const saved =
    localStorage.getItem(
      S967_LANGUAGE_STORAGE_KEY
    );

  if (
    saved &&
    S967_LANGUAGES[saved]
  ) {
    return saved;
  }

  return null;
}


function getCurrentLanguage() {
  return (
    getSavedLanguage() ||
    getBrowserLanguage()
  );
}


function getTranslation(
  key,
  language = getCurrentLanguage()
) {
  return (
    S967_TRANSLATIONS[language]?.[key] ??
    S967_TRANSLATIONS.en?.[key] ??
    key
  );
}


function applyLanguage(language) {
  if (!S967_LANGUAGES[language]) {
    language = "en";
  }

  document.documentElement.lang =
    language;

  document.documentElement.dataset.language =
    language;

  document
    .querySelectorAll(
      "[data-i18n]"
    )
    .forEach((element) => {
      const key =
        element.dataset.i18n;

      element.textContent =
        getTranslation(
          key,
          language
        );
    });

  document
    .querySelectorAll(
      "[data-i18n-html]"
    )
    .forEach((element) => {
      const key =
        element.dataset.i18nHtml;

      element.innerHTML =
        getTranslation(
          key,
          language
        );
    });

  document
    .querySelectorAll(
      "[data-i18n-placeholder]"
    )
    .forEach((element) => {
      const key =
        element.dataset.i18nPlaceholder;

      element.placeholder =
        getTranslation(
          key,
          language
        );
    });

  document
    .querySelectorAll(
      "[data-i18n-title]"
    )
    .forEach((element) => {
      const key =
        element.dataset.i18nTitle;

      element.title =
        getTranslation(
          key,
          language
        );
    });

  document
    .querySelectorAll(
      "[data-language-choice]"
    )
    .forEach((button) => {
      const isActive =
        button.dataset.languageChoice ===
        language;

      button.setAttribute(
        "aria-checked",
        String(isActive)
      );
    });

  window.dispatchEvent(
    new CustomEvent(
      "s967languagechange",
      {
        detail: {
          language,
        },
      }
    )
  );
}


function setLanguage(language) {
  if (!S967_LANGUAGES[language]) {
    return;
  }

  localStorage.setItem(
    S967_LANGUAGE_STORAGE_KEY,
    language
  );

  applyLanguage(language);
}


function closeLanguagePicker(
  picker,
  button
) {
  picker.classList.remove(
    "is-open"
  );

  button.setAttribute(
    "aria-expanded",
    "false"
  );
}


function initializeLanguagePicker() {
  const pickers =
    document.querySelectorAll(
      "[data-language-picker]"
    );

  pickers.forEach((picker) => {
    const button =
      picker.querySelector(
        "[data-language-button]"
      );

    const choices =
      picker.querySelectorAll(
        "[data-language-choice]"
      );

    if (!button) {
      return;
    }

    button.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();

        const isOpen =
          picker.classList.toggle(
            "is-open"
          );

        button.setAttribute(
          "aria-expanded",
          String(isOpen)
        );
      }
    );

    choices.forEach((choice) => {
      choice.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopPropagation();

          const language =
            choice.dataset
              .languageChoice;

          setLanguage(
            language
          );

          closeLanguagePicker(
            picker,
            button
          );
        }
      );
    });
  });

  document.addEventListener(
    "click",
    () => {
      document
        .querySelectorAll(
          "[data-language-picker].is-open"
        )
        .forEach((picker) => {
          const button =
            picker.querySelector(
              "[data-language-button]"
            );

          picker.classList.remove(
            "is-open"
          );

          button?.setAttribute(
            "aria-expanded",
            "false"
          );
        });
    }
  );
}


function initializeLanguage() {
  applyLanguage(
    getCurrentLanguage()
  );

  initializeLanguagePicker();
}


if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    initializeLanguage
  );
} else {
  initializeLanguage();
}
