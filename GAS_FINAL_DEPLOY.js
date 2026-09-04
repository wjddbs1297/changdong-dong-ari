/**
 * ------------------------------------------------------------------
 * [시립창동청소년센터] 동아리 연습실 예약 시스템 백엔드 스크립트 (최종 수정 버전)
 * ------------------------------------------------------------------
 * 이 파일은 삭제 오류(ReferenceError)와 3시간 제한 오류(NaN)를 모두 수정한 최종본입니다.
 */

// 스프레드시트 ID (사용자 제공)
var SPREADSHEET_ID = "1PBbGtI-TM10OpWijNd4u3Hbfll97dFPqwwof3VVkSjs";
var TIMEZONE = "Asia/Seoul";
var MAX_CLUB_ACCOUNTS = 40;
var SESSION_SECONDS = 7200;
var MAX_LOGIN_FAILURES = 5;
var LOCK_MINUTES = 15;

function doGet(e) {
    return handleRequest(e);
}

function doPost(e) {
    return handleRequest(e);
}

function isValidPin(pin) {
    return /^\d{4}$/.test(String(pin || "")) && !/^(\d)\1{3}$/.test(String(pin)) && ["1234", "4321", "0000"].indexOf(String(pin)) === -1;
}

function getPinPepper() {
    var properties = PropertiesService.getScriptProperties();
    var pepper = properties.getProperty("PIN_PEPPER");
    if (!pepper) {
        pepper = Utilities.getUuid() + Utilities.getUuid();
        properties.setProperty("PIN_PEPPER", pepper);
    }
    return pepper;
}

function hashPin(pin, salt) {
    var bytes = Utilities.computeHmacSha256Signature(String(pin) + ":" + String(salt), getPinPepper());
    return Utilities.base64EncodeWebSafe(bytes);
}

function findUserRecord(userId) {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Users");
    if (!sheet) return null;
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim().toLowerCase() === String(userId).trim().toLowerCase()) {
            return { sheet: sheet, rowNumber: i + 1, row: data[i] };
        }
    }
    return null;
}

function publicUser(record) {
    return { id: String(record.row[0]), name: String(record.row[1]), status: record.row[2] || "Active", role: record.row[3] || "user" };
}

function createSession(record) {
    var token = Utilities.getUuid() + Utilities.getUuid();
    var session = { user: publicUser(record), mustChangePin: record.row[6] === true || String(record.row[6]).toUpperCase() === "TRUE" };
    CacheService.getScriptCache().put("session:" + token, JSON.stringify(session), SESSION_SECONDS);
    return { sessionToken: token, user: session.user, mustChangePin: session.mustChangePin };
}

function getSession(token) {
    if (!token) return null;
    var value = CacheService.getScriptCache().get("session:" + token);
    return value ? JSON.parse(value) : null;
}

function loginWithPin(params) {
    var userId = String(params.userId || "").trim();
    var pin = String(params.pin || "");
    if (!userId || !/^\d{4}$/.test(pin)) return sendResponse({ message: "동아리 아이디와 4자리 PIN을 확인해주세요." }, false);
    var record = findUserRecord(userId);
    if (!record) return sendResponse({ message: "동아리 아이디 또는 PIN이 올바르지 않습니다." }, false);
    if (String(record.row[2] || "Active") !== "Active") return sendResponse({ message: "비활성화된 계정입니다." }, false);

    var lockedUntil = record.row[8] ? new Date(record.row[8]) : null;
    if (lockedUntil && lockedUntil.getTime() > new Date().getTime()) {
        return sendResponse({ message: "로그인 시도가 너무 많아 잠시 잠긴 계정입니다. 15분 후 다시 시도해주세요." }, false);
    }
    var salt = String(record.row[4] || "");
    var storedHash = String(record.row[5] || "");
    if (!salt || !storedHash) return sendResponse({ message: "PIN이 아직 설정되지 않은 계정입니다. 관리자에게 문의해주세요." }, false);

    if (hashPin(pin, salt) !== storedHash) {
        var failures = (parseInt(record.row[7]) || 0) + 1;
        var lockValue = "";
        if (failures >= MAX_LOGIN_FAILURES) {
            lockValue = new Date(new Date().getTime() + LOCK_MINUTES * 60 * 1000);
            failures = 0;
        }
        record.sheet.getRange(record.rowNumber, 8, 1, 2).setValues([[failures, lockValue]]);
        return sendResponse({ message: "동아리 아이디 또는 PIN이 올바르지 않습니다." }, false);
    }

    var now = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm:ss");
    record.sheet.getRange(record.rowNumber, 8, 1, 3).setValues([[0, "", now]]);
    return sendResponse(createSession(record));
}

function setPinForRecord(record, pin, mustChange, allowTemporaryPin) {
    var isTemporaryPin = allowTemporaryPin === true && String(pin) === "0000";
    if (!isTemporaryPin && !isValidPin(pin)) throw new Error("PIN은 쉬운 번호를 제외한 4자리 숫자여야 합니다.");
    var salt = Utilities.getUuid();
    record.sheet.getRange(record.rowNumber, 5, 1, 5).setValues([[salt, hashPin(pin, salt), mustChange === true, 0, ""]]);
}

// 최초 배포 시 Apps Script 편집기에서만 실행하는 초기 PIN 설정 함수
function setInitialPinFromEditor(userId, pin) {
    var record = findUserRecord(userId);
    if (!record) throw new Error("계정을 찾을 수 없습니다.");
    setPinForRecord(record, String(pin), true, true);
}

// PIN이 없는 계정의 초기 PIN을 0000으로 통일합니다.
function generateInitialPinsFromEditor() {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Users");
    if (!sheet) throw new Error("Users 시트를 찾을 수 없습니다.");
    var data = sheet.getDataRange().getValues();
    var issued = [];
    for (var i = 1; i < data.length; i++) {
        if (!data[i][0] || data[i][5]) continue;
        var pin = "0000";
        var record = { sheet: sheet, rowNumber: i + 1, row: data[i] };
        setPinForRecord(record, pin, true, true);
        issued.push({ userId: String(data[i][0]), name: String(data[i][1]), temporaryPin: pin });
    }
    console.log("초기 PIN 0000 설정 완료: " + issued.length + "개 계정");
    return issued;
}

function handleRequest(e) {
    try {
        var params = {};

        // 1. URL 파라미터 복사
        if (e.parameter) {
            for (var key in e.parameter) { params[key] = e.parameter[key]; }
        }

        // 2. POST Body(JSON) 복사
        if (e.postData && e.postData.contents) {
            try {
                var body = JSON.parse(e.postData.contents);
                for (var key in body) { params[key] = body[key]; }
            } catch (err) { console.log("JSON Parse Error"); }
        }

        var method = params.method;

        if (method === "LOGIN") return loginWithPin(params);

        var session = getSession(params.sessionToken);
        if (!session) return sendResponse({ message: "로그인이 만료되었습니다. 다시 로그인해주세요." }, false);
        var liveRecord = findUserRecord(session.user.id);
        if (!liveRecord || String(liveRecord.row[2] || "Active") !== "Active") return sendResponse({ message: "비활성화된 계정입니다." }, false);
        session.user = publicUser(liveRecord);
        session.mustChangePin = liveRecord.row[6] === true || String(liveRecord.row[6]).toUpperCase() === "TRUE";
        params.authUser = session.user;
        if (session.user.role !== "admin") params.userId = session.user.id;

        if (method === "VERIFY_SESSION") {
            return sendResponse({ user: session.user, mustChangePin: session.mustChangePin });
        }
        if (method === "LOGOUT") {
            CacheService.getScriptCache().remove("session:" + params.sessionToken);
            return sendResponse({ message: "Logged out" });
        }
        if (method === "CHANGE_PIN") return changePin(params);
        if (method === "ADMIN_RESET_PIN") return adminResetPin(params);

        if (session.mustChangePin) {
            return sendResponse({ message: "계속하려면 임시 PIN을 먼저 변경해주세요." }, false);
        }

        // 1. 설정 불러오기 (시트에서 읽기)
        if (method === "GET_CONFIG") {
            var config = getSheetConfig();
            if (session.user.role !== "admin") config.users = [];
            return sendResponse(config);
        }

        // 2. 예약 조회
        if (method === "GET") {
            if (!params.date && !params.userId && session.user.role !== "admin") return sendResponse({ message: "관리자 권한이 필요합니다." }, false);
            return getBookings(params);
        }

        // 3. 예약 생성
        if (method === "POST" || method === "CREATE") {
            return createBooking(params);
        }

        // 4. 공지사항 조회
        if (method === "GET_NOTICES") {
            return getNotices();
        }

        // 5. 공지사항 생성
        if (method === "CREATE_NOTICE") {
            if (session.user.role !== "admin") return sendResponse({ message: "관리자 권한이 필요합니다." }, false);
            return createNotice(params);
        }

        // 6. 건의사항 생성
        if (method === "CREATE_SUGGESTION") {
            return createSuggestion(params);
        }

        // 7. 예약 취소
        if (method === "CANCEL_BOOKING") {
            return cancelBooking(params);
        }

        // 8. 예약 수정
        if (method === "UPDATE_BOOKING") {
            return updateBooking(params);
        }

        if (method === "GET_PENDING_REPORTS") {
            return getPendingActivityReports(params);
        }

        if (method === "GET_MEMBERS") {
            return getMembers(params);
        }

        if (method === "SUBMIT_ACTIVITY_LOG") {
            return submitActivityLog(params);
        }

        return sendResponse({ message: "Unknown Method" }, false);

    } catch (error) {
        return sendResponse({ message: "Server Error: " + error.toString() }, false);
    }
}

// ==========================================
// 핵심 로직
// ==========================================

function changePin(params) {
    var record = findUserRecord(params.authUser.id);
    if (!record) return sendResponse({ message: "계정을 찾을 수 없습니다." }, false);
    var currentPin = String(params.currentPin || "");
    var newPin = String(params.newPin || "");
    if (hashPin(currentPin, String(record.row[4] || "")) !== String(record.row[5] || "")) {
        return sendResponse({ message: "현재 PIN이 올바르지 않습니다." }, false);
    }
    if (currentPin === newPin) return sendResponse({ message: "현재 PIN과 다른 PIN을 사용해주세요." }, false);
    try { setPinForRecord(record, newPin, false); }
    catch (error) { return sendResponse({ message: error.message }, false); }
    var session = { user: publicUser(record), mustChangePin: false };
    CacheService.getScriptCache().put("session:" + params.sessionToken, JSON.stringify(session), SESSION_SECONDS);
    return sendResponse({ message: "PIN이 변경되었습니다." });
}

function adminResetPin(params) {
    if (params.authUser.role !== "admin") return sendResponse({ message: "관리자 권한이 필요합니다." }, false);
    var record = findUserRecord(params.userId);
    if (!record) return sendResponse({ message: "계정을 찾을 수 없습니다." }, false);
    try { setPinForRecord(record, String(params.newPin || ""), true); }
    catch (error) { return sendResponse({ message: error.message }, false); }
    return sendResponse({ message: "임시 PIN으로 초기화했습니다." });
}


function getSheetConfig() {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // 1. Users 시트 읽기
    var userSheet = ss.getSheetByName("Users");
    var users = [];
    if (userSheet) {
        var rows = userSheet.getDataRange().getValues();
        // i=1부터 (헤더 제외)
        for (var i = 1; i < rows.length; i++) {
            // A:ID, B:Name, C:Status, D:Role
            if (rows[i][0]) {
                users.push({
                    id: String(rows[i][0]),
                    name: String(rows[i][1]),
                    status: rows[i][2] || 'Active',
                    role: rows[i][3] || 'user'
                });
            }
        }
    }

    // 안전장치: 기본 유저 (Daily, Admin) 추가
    var hasDaily = users.some(function (u) { return u.id.toLowerCase() === 'daily'; });
    if (!hasDaily) users.push({ id: "Daily", name: "데일리", status: "Active", role: "user" });

    var hasAdmin = users.some(function (u) { return u.id.toLowerCase() === 'admin'; });
    if (!hasAdmin) users.push({ id: "Admin", name: "관리자", status: "Active", role: "admin" });

    // 2. Rooms 시트 읽기
    var roomSheet = ss.getSheetByName("Rooms");
    var rooms = [];
    if (roomSheet) {
        var rows = roomSheet.getDataRange().getValues();
        for (var i = 1; i < rows.length; i++) {
            // A:ID, B:Name, C:Order
            if (rows[i][0]) {
                rooms.push({
                    id: String(rows[i][0]),
                    name: String(rows[i][1]),
                    order: rows[i][2]
                });
            }
        }
    }

    var clubAccountCount = users.filter(function (u) {
        return u.role !== 'admin' && u.id.toLowerCase() !== 'daily' && u.id !== '데일리';
    }).length;

    return {
        users: users,
        rooms: rooms,
        maxClubAccounts: MAX_CLUB_ACCOUNTS,
        clubAccountCount: clubAccountCount
    };
}

function getBookings(params) {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("예약내역");
    if (!sheet) return sendResponse([]);

    var data = sheet.getDataRange().getValues();
    var bookings = [];
    var targetDate = params.date;
    var targetUser = params.userId;

    for (var i = 1; i < data.length; i++) {
        var row = data[i];
        if (row.length < 7) continue;

        var rowDate = formatDateSafe(row[3]); // D열 Date

        if (targetDate && rowDate !== targetDate) continue;
        if (targetUser && String(row[1]).toLowerCase() !== targetUser.toLowerCase()) continue;
        var canSeeDetails = params.authUser.role === "admin" || String(row[1]).toLowerCase() === params.authUser.id.toLowerCase();

        bookings.push({
            id: row[0],
            userId: row[1],
            userName: row[2],
            date: rowDate,
            startTime: formatTimeSafe(row[4]),
            endTime: formatTimeSafe(row[5]),
            roomId: row[6],
            createdAt: row[7],
            phoneNumber: canSeeDetails ? (row[8] || "") : "",
            activityContent: canSeeDetails ? (row[9] || "") : "",
            suggestion: canSeeDetails ? (row[10] || "") : "",
            headcount: {
                elemM: parseInt(row[11]) || 0, elemF: parseInt(row[12]) || 0,
                midM: parseInt(row[13]) || 0, midF: parseInt(row[14]) || 0,
                highM: parseInt(row[15]) || 0, highF: parseInt(row[16]) || 0,
                u24M: parseInt(row[17]) || 0, u24F: parseInt(row[18]) || 0
            },
            participants: canSeeDetails ? (row[19] || "") : "",
            signature: canSeeDetails ? (row[20] || "") : "",
            expectedHeadcount: parseInt(row[21]) || 0,
            reportStatus: row[22] || "",
            reportCompletedAt: row[23] || "",
            reportUpdatedBy: row[24] || ""
        });
    }
    return sendResponse(bookings);
}

// -----------------------------------------------------------
// 예약 생성 (3시간 제한 로직 핵심 수정 + LockService)
// -----------------------------------------------------------
function createBooking(params) {
    // [중요] 락(Lock) 설정: 동시 요청 시 최대 30초간 대기 시킴
    var lock = LockService.getScriptLock();
    try {
        lock.waitLock(30000); // 다른 작업이 끝날 때까지 대기
    } catch (e) {
        return sendResponse({ message: "서버가 바쁩니다. 잠시 후 다시 시도해주세요." }, false);
    }

    try {
        var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
        var sheet = ss.getSheetByName("예약내역");
        if (!sheet) {
            sheet = ss.insertSheet("예약내역");
            sheet.appendRow([
                "ID","User ID","Name","Date","Start Time","End Time","Room ID","Created At","Phone Number",
                "활동내용","건의사항","초등남","초등여","중등남","중등여","고등남","고등여","24세이하남","24세이하여","참여자명단","대표자서명",
                "예정 활동인원","활동일지 상태","활동일지 제출일시","최종 작성자"
            ]);
        }

        // 1. 입력값 표준화
        var userId = String(params.userId || "").trim();
        var inputDate = formatDateSafe(params.date); // YYYY-MM-DD
        var duration = parseInt(params.duration || 0);
        var roomId = String(params.roomId || "").trim();
        var startTime = params.startTime;
        var expectedHeadcount = parseInt(params.expectedHeadcount || 0);

        if (!expectedHeadcount || expectedHeadcount < 1 || expectedHeadcount > 99) {
            return sendResponse({ message: "예정 활동인원을 1~99명 사이로 입력해주세요." }, false);
        }

        // 유저 권한 확인
        var config = getSheetConfig();
        var user = config.users.find(function (u) { return u.id.toLowerCase() === userId.toLowerCase(); });
        var userName = user ? user.name : userId;
        var isAdmin = user && user.role === 'admin';

        // 2. 3시간 제한 체크 (Admin 제외)
        var data = sheet.getDataRange().getValues();
        var totalHours = 0;

        if (!isAdmin) {
            for (var i = 1; i < data.length; i++) {
                var rowUserId = String(data[i][1]).trim();
                var rowDate = formatDateSafe(data[i][3]);

                // 아이디(대소문자 무시)와 날짜가 완벽히 일치할 때만 합산
                if (rowUserId.toLowerCase() === userId.toLowerCase() && rowDate === inputDate) {
                    var sTime = formatTimeSafe(data[i][4]);
                    var eTime = formatTimeSafe(data[i][5]);
                    var s = parseInt(sTime.split(":")[0]);
                    var e = parseInt(eTime.split(":")[0]);

                    if (!isNaN(s) && !isNaN(e)) {
                        totalHours += (e - s);
                    }
                }
            }

            // 신청 시간을 더했을 때 3시간 초과 시 차단
            if (totalHours + duration > 3) {
                return sendResponse({
                    message: "제한 초과: 해당 날짜에 이미 " + totalHours + "시간 예약이 있습니다. 총 3시간까지만 가능합니다."
                }, false);
            }
        }

        // 3. 중복 예약(방/시간) 체크
        var startHour = parseInt(startTime.split(":")[0]);
        for (var i = 1; i < data.length; i++) {
            if (formatDateSafe(data[i][3]) === inputDate && String(data[i][6]).trim() === roomId) {
                var rs = parseInt(formatTimeSafe(data[i][4]).split(":")[0]);
                var re = parseInt(formatTimeSafe(data[i][5]).split(":")[0]);
                if (startHour < re && (startHour + duration) > rs) {
                    return sendResponse({ message: "이미 다른 예약이 있는 시간대입니다." }, false);
                }
            }
        }

        // 4. 예약 데이터 기록
        var newId = "BK_" + new Date().getTime();
        var endTime = (startHour + duration) + ":00";
        var createdAt = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm:ss");

        sheet.appendRow([
            newId,
            userId,
            userName,
            inputDate,
            startTime,
            endTime,
            roomId,
            createdAt,
            params.phoneNumber     || "",   // I
            "",                         // J 활동 후 작성
            "",                         // K 활동 후 작성
            0, 0, 0, 0, 0, 0, 0, 0,     // L~S 실제 참여자로 자동 계산
            "",                         // T 활동 후 작성
            "",                         // U 대표자 서명은 활동 후 작성
            expectedHeadcount,           // V 예정 활동인원
            "Pending",                  // W 활동일지 상태
            "",                         // X 제출일시
            ""                          // Y 최종 작성자
        ]);

        return sendResponse({
            id: newId,
            userId: userId,
            totalBooked: totalHours + duration
        });

    } catch (err) {
        return sendResponse({ message: "처리 중 오류 발생: " + err.toString() }, false);
    } finally {
        // [중요] 작업 완료 후 반드시 락 해제
        lock.releaseLock();
    }
}
function cancelBooking(params) {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("예약내역");
    if (!sheet) return sendResponse({ message: "예약 내역 시트를 찾을 수 없습니다." }, false);

    // 입력값 정규화 (공백 제거 및 문자열 변환)
    var bookingId = String(params.bookingId || params.bookingID || "").trim();
    var userId = String(params.userId || "").trim();

    if (!bookingId || !userId) {
        return sendResponse({ message: "예약 ID 또는 사용자 ID가 누락되었습니다." }, false);
    }

    // [중요] 유저 정보 다시 조회하여 관리자 여부 판별 (대소문자 무시)
    var config = getSheetConfig();
    var user = config.users.find(function (u) {
        return u.id.toLowerCase() === userId.toLowerCase();
    });
    var isAdmin = user && user.role === 'admin';

    var data = sheet.getDataRange().getValues();

    // i=1 (헤더 제외)부터 탐색
    for (var i = 1; i < data.length; i++) {
        var rowBookingId = String(data[i][0]).trim();
        var rowUserId = String(data[i][1]).trim();

        if (rowBookingId === bookingId) {
            // 본인 확인 OR 관리자 권한 확인 (대소문자 무시 비교)
            if (rowUserId.toLowerCase() === userId.toLowerCase() || isAdmin) {
                sheet.deleteRow(i + 1);
                console.log("취소 성공: " + bookingId + " (요청자: " + userId + ")");
                return sendResponse({ message: "예약이 정상적으로 취소되었습니다." });
            } else {
                return sendResponse({ message: "취소 권한이 없습니다. (본인 또는 관리자만 가능)" }, false);
            }
        }
    }

    // 반복문을 다 돌았는데도 못 찾은 경우
    console.log("취소 실패: ID를 찾을 수 없음 -> " + bookingId);
    return sendResponse({ message: "해당 예약 번호를 찾을 수 없습니다. (ID: " + bookingId + ")" }, false);
}

function updateBooking(params) {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("예약내역");
    if (!sheet) return sendResponse({ message: "Sheet not found" }, false);

    var bookingId = params.bookingId;
    var userId = params.userId;
    // [중요] 날짜 포맷 통일
    var newDate = formatDateSafe(params.date);
    var newStartTime = params.startTime;
    var newDuration = parseInt(params.duration);
    var newRoomId = params.roomId;

    // 유저 정보 조회 (Admin 체크용)
    var config = getSheetConfig();
    var user = config.users.find(function (u) { return u.id.toLowerCase() === userId.toLowerCase(); });
    var isAdmin = user && user.role === 'admin';

    // 1. Find the booking ROW
    var data = sheet.getDataRange().getValues();
    var rowIndex = -1;

    for (var i = 1; i < data.length; i++) {
        if (String(data[i][0]) === bookingId) {
            if (String(data[i][1]).toLowerCase() !== userId.toLowerCase()) return sendResponse({ message: "Permission denied" }, false);
            rowIndex = i;
            break;
        }
    }

    if (rowIndex === -1) return sendResponse({ message: "Booking not found" }, false);

    // [New] 3시간 제한 체크 (Admin 제외) - createBooking과 동일한 로직 적용
    if (!isAdmin) {
        var totalHours = 0;
        for (var i = 1; i < data.length; i++) {
            // Skip self and other users
            if (i === rowIndex) continue;

            var rowUserId = String(data[i][1]).trim();
            if (rowUserId.toLowerCase() !== userId.toLowerCase()) continue;

            // Date Check (formatDateSafe 사용)
            var rowDate = formatDateSafe(data[i][3]);

            if (rowDate === newDate) {
                var startTimeStr = formatTimeSafe(data[i][4]);
                var endTimeStr = formatTimeSafe(data[i][5]);

                var s = parseInt(startTimeStr.split(":")[0]);
                var e = parseInt(endTimeStr.split(":")[0]);

                if (!isNaN(s) && !isNaN(e)) {
                    totalHours += (e - s);
                }
            }
        }

        if (totalHours + newDuration > 3) {
            return sendResponse({
                message: "하루 최대 3시간까지만 이용 가능합니다.\n(현재 예약된 시간: " + totalHours + "시간 /  수정 요청: " + newDuration + "시간)"
            }, false);
        }
    }

    // 2. Calculate New EndTime
    var startHour = parseInt(newStartTime.split(":")[0]);
    var newEndTime = (startHour + newDuration) + ":00";

    // 3. Check Overlap using formatDateSafe
    for (var i = 1; i < data.length; i++) {
        if (i === rowIndex) continue; // Skip self

        var rowDate = formatDateSafe(data[i][3]);
        var rowRoomId = String(data[i][6]).trim();

        if (rowDate === newDate && String(rowRoomId) === String(newRoomId)) {
            var rowStart = parseInt(formatTimeSafe(data[i][4]).split(":")[0]);
            var rowEnd = parseInt(formatTimeSafe(data[i][5]).split(":")[0]);

            if (startHour < rowEnd && (startHour + newDuration) > rowStart) {
                return sendResponse({ message: "해당 시간은 이미 예약되어 있습니다." }, false);
            }
        }
    }

    // 4. Update Row
    // 날짜도 newDate(표준 포맷)로 업데이트 해야 함
    var range = sheet.getRange(rowIndex + 1, 4, 1, 4); // Columns D, E, F, G (Date, Start, End, Room)
    range.setValues([[newDate, newStartTime, newEndTime, newRoomId]]);

    return sendResponse({ message: "Booking updated" });
}

function getMembers(params) {
    var userId = String(params.userId || "").trim();
    if (!userId) return sendResponse({ message: "동아리 계정ID가 필요합니다." }, false);

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("Members");
    if (!sheet) return sendResponse([]);

    var data = sheet.getDataRange().getValues();
    var members = [];
    for (var i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim().toLowerCase() !== userId.toLowerCase()) continue;
        if (String(data[i][5] || "Active") !== "Active") continue;
        members.push({
            clubUserId: String(data[i][0]),
            memberId: String(data[i][1]),
            name: String(data[i][2]),
            schoolLevel: String(data[i][3]),
            gender: String(data[i][4]),
            status: String(data[i][5] || "Active")
        });
    }
    return sendResponse(members);
}

function getPendingActivityReports(params) {
    var userId = String(params.userId || "").trim();
    if (!userId) return sendResponse({ message: "사용자 ID가 필요합니다." }, false);

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("예약내역");
    if (!sheet) return sendResponse([]);

    var data = sheet.getDataRange().getValues();
    var nowKey = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm");
    var pending = [];
    for (var i = 1; i < data.length; i++) {
        var row = data[i];
        if (String(row[1]).trim().toLowerCase() !== userId.toLowerCase()) continue;
        if (String(row[22]).trim() !== "Pending") continue;

        var date = formatDateSafe(row[3]);
        var endTime = formatTimeSafe(row[5]);
        var endKey = date + " " + endTime;
        if (endKey > nowKey) continue;

        pending.push({
            id: row[0], userId: row[1], userName: row[2], date: date,
            startTime: formatTimeSafe(row[4]), endTime: endTime, roomId: row[6],
            createdAt: row[7], expectedHeadcount: parseInt(row[21]) || 0,
            reportStatus: row[22]
        });
    }
    pending.sort(function (a, b) {
        return (a.date + " " + a.endTime).localeCompare(b.date + " " + b.endTime);
    });
    return sendResponse(pending);
}

function submitActivityLog(params) {
    var bookingId = String(params.bookingId || "").trim();
    var userId = String(params.userId || "").trim();
    var activityContent = String(params.activityContent || "").trim();
    var participants = String(params.participants || "").trim();

    if (!bookingId || !userId) return sendResponse({ message: "예약 ID와 사용자 ID가 필요합니다." }, false);
    if (activityContent.length < 15) return sendResponse({ message: "주요 활동 내용을 15자 이상 입력해주세요." }, false);
    if (!participants) return sendResponse({ message: "실제 참여자를 1명 이상 입력해주세요." }, false);

    var lock = LockService.getScriptLock();
    try { lock.waitLock(30000); }
    catch (e) { return sendResponse({ message: "서버가 바쁩니다. 잠시 후 다시 시도해주세요." }, false); }

    try {
        var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
        var sheet = ss.getSheetByName("예약내역");
        if (!sheet) return sendResponse({ message: "예약내역 시트를 찾을 수 없습니다." }, false);

        var config = getSheetConfig();
        var writer = config.users.find(function (u) { return u.id.toLowerCase() === userId.toLowerCase(); });
        var isAdmin = writer && writer.role === 'admin';
        var data = sheet.getDataRange().getValues();

        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            if (String(row[0]).trim() !== bookingId) continue;
            if (String(row[1]).trim().toLowerCase() !== userId.toLowerCase() && !isAdmin) {
                return sendResponse({ message: "본인의 활동일지만 작성할 수 있습니다." }, false);
            }
            if (String(row[22]).trim() === "Completed" && !isAdmin) {
                return sendResponse({ message: "이미 제출된 활동일지입니다." }, false);
            }

            var endKey = formatDateSafe(row[3]) + " " + formatTimeSafe(row[5]);
            var nowKey = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm");
            if (endKey > nowKey && !isAdmin) {
                return sendResponse({ message: "활동 종료 후에 활동일지를 작성할 수 있습니다." }, false);
            }

            sheet.getRange(i + 1, 10, 1, 12).setValues([[
                activityContent,
                String(params.suggestion || "").trim(),
                parseInt(params.elemM) || 0, parseInt(params.elemF) || 0,
                parseInt(params.midM) || 0, parseInt(params.midF) || 0,
                parseInt(params.highM) || 0, parseInt(params.highF) || 0,
                parseInt(params.u24M) || 0, parseInt(params.u24F) || 0,
                participants,
                String(params.signature || "")
            ]]);
            var completedAt = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm:ss");
            sheet.getRange(i + 1, 23, 1, 3).setValues([["Completed", completedAt, userId]]);
            return sendResponse({ message: "활동일지가 저장되었습니다.", completedAt: completedAt });
        }
        return sendResponse({ message: "예약을 찾을 수 없습니다." }, false);
    } finally {
        lock.releaseLock();
    }
}

function getNotices() {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("Notices");
    if (!sheet) return sendResponse([]);

    var data = sheet.getDataRange().getValues();
    var notices = [];

    // i=1 (헤더 제외)
    for (var i = 1; i < data.length; i++) {
        var row = data[i];
        // [ID, Title, Content, Author, Date, ImageUrl]
        if (row[0]) {
            notices.push({
                id: row[0],
                title: row[1],
                content: row[2],
                author: row[3],
                date: row[4] instanceof Date ? Utilities.formatDate(row[4], TIMEZONE, "yyyy-MM-dd HH:mm") : String(row[4]),
                imageUrl: row[5] || ""
            });
        }
    }
    // 최신순 정렬 (역순)
    notices.reverse();
    return sendResponse(notices);
}

function createNotice(params) {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("Notices");
    if (!sheet) {
        sheet = ss.insertSheet("Notices");
        sheet.appendRow(["ID", "Title", "Content", "Author", "Date", "ImageUrl"]);
    }

    var title = params.title;
    var content = params.content;
    var author = params.author;
    var imageUrl = params.imageUrl || "";

    var newId = "NOTI_" + new Date().getTime();
    var now = new Date();
    var dateStr = Utilities.formatDate(now, TIMEZONE, "yyyy-MM-dd HH:mm");

    sheet.appendRow([newId, title, content, author, dateStr, imageUrl]);

    return sendResponse({
        id: newId,
        title: title,
        date: dateStr
    });
}

function createSuggestion(params) {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("Suggestions");
    if (!sheet) {
        sheet = ss.insertSheet("Suggestions");
        sheet.appendRow(["ID", "User ID", "Name", "Content", "Date"]);
    }

    var userId = params.userId;
    var name = params.name;
    var content = params.content;

    var newId = "SUG_" + new Date().getTime();
    var now = new Date();
    var dateStr = Utilities.formatDate(now, TIMEZONE, "yyyy-MM-dd HH:mm:ss");

    sheet.appendRow([newId, userId, name, content, dateStr]);

    return sendResponse({
        id: newId,
        message: "Suggestion saved"
    });
}


function deleteOldBookings() {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("예약내역");
    if (!sheet) return;

    var rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) return; // Header only

    var header = rows[0];
    var data = rows.slice(1);
    var now = new Date();
    // 2 Months ago
    var cutoffDate = new Date();
    cutoffDate.setMonth(now.getMonth() - 2);

    // Filter data: Keep records that are NOT old
    var newData = data.filter(function (row) {
        // Date is at index 3 (Column D)
        if (!row[3]) return false;

        var dateVal = row[3];
        // Handle Date object or String
        var rowDate;
        if (dateVal instanceof Date) {
            rowDate = dateVal;
        } else {
            rowDate = new Date(dateVal);
        }

        // Keep if rowDate >= cutoffDate
        return rowDate >= cutoffDate;
    });

    // If deletions occurred
    if (newData.length < data.length) {
        sheet.clearContents();
        sheet.appendRow(header);
        if (newData.length > 0) {
            sheet.getRange(2, 1, newData.length, newData[0].length).setValues(newData);
        }
        console.log("Deleted " + (data.length - newData.length) + " old bookings.");
    }
}

// -------------------------------------------------------------

// -----------------------------------------------------------
// 유틸리티 함수 (날짜 포맷 통일의 핵심)
// -----------------------------------------------------------
function formatDateSafe(val) {
    if (!val) return "";
    var d;
    if (val instanceof Date) {
        d = val;
    } else {
        // 문자열일 경우 하이픈/점/슬래시 등을 고려하여 Date 객체로 변환 시도
        var s = String(val).replace(/[\.\/]/g, '-').trim();
        // "2024- 5- 20" 처럼 될 수 있으므로 공백 제거 등 추가 처리 필요할 수 있으나
        // new Date()는 비교적 유연함.
        d = new Date(s);
    }

    // 유효한 날짜라면 YYYY-MM-DD 문자열로 변환
    if (!isNaN(d.getTime())) {
        return Utilities.formatDate(d, TIMEZONE, "yyyy-MM-dd");
    }
    return String(val); // 변환 실패 시 원본 반환
}

function formatTimeSafe(val) {
    if (!val) return "";
    if (val instanceof Date) return Utilities.formatDate(val, TIMEZONE, "HH:mm");
    var s = String(val).trim();
    if (s.indexOf(":") === -1 && s.length > 0) s += ":00"; // "13" -> "13:00"
    return s;
}

function sendResponse(data, success) {
    if (success === undefined) success = true;
    var result = {
        status: success ? 'success' : 'error',
        data: success ? data : null,
        message: success ? null : (data.message || "Error")
    };
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
