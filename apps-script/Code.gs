// ==================== CONFIG ====================
const SPREADSHEET_ID = '1Isba08dIUNvDm_BLj05Z5Krntl2nvqdrqo5t6mA4hmw';
const ADMIN_PASSWORD = '@admin1234';
const SECRET_KEY = 'QRPoint_Secret_2026_!@#$';
const POINTS_PER_SCAN = 10;
const MAX_SCANS_PER_DAY = 2;

const SHEET_POINTS      = 'Points';
const SHEET_REWARDS     = 'Rewards';
const SHEET_REDEMPTIONS = 'Redemptions';

// ==================== HELPERS: แปลงค่าจาก Sheets ====================
// Sheets อาจเก็บ phone เป็น number (ตัด 0 นำ) และ date เป็น Date object
function toPhone(val) {
  var s = String(val).replace(/[^0-9]/g, '');
  if (s.length === 9) s = '0' + s;   // เติม 0 นำถ้าหาย
  return s;
}
function toDate(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Bangkok', 'yyyy-MM-dd');
  }
  return String(val);
}
function toNum(val) { return Number(val); }

// ==================== SETUP ====================
function setupSheets() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  var pointsSheet = ss.getSheetByName(SHEET_POINTS);
  if (!pointsSheet) {
    pointsSheet = ss.insertSheet(SHEET_POINTS);
    pointsSheet.appendRow(['id','phone','date','points','cycle','timestamp']);
    pointsSheet.getRange('1:1').setFontWeight('bold');
  }
  // ล็อก format คอลัมน์ phone(B) และ date(C) เป็น text เสมอ
  pointsSheet.getRange('B:B').setNumberFormat('@STRING@');
  pointsSheet.getRange('C:C').setNumberFormat('@STRING@');

  var rewardsSheet = ss.getSheetByName(SHEET_REWARDS);
  if (!rewardsSheet) {
    rewardsSheet = ss.insertSheet(SHEET_REWARDS);
    rewardsSheet.appendRow(['min_points','reward_name','reward_detail']);
    rewardsSheet.getRange('1:1').setFontWeight('bold');
    rewardsSheet.appendRow([50,  'ส่วนลด 10%',     'รับส่วนลด 10% สำหรับการซื้อครั้งถัดไป']);
    rewardsSheet.appendRow([100, 'ส่วนลด 20%',     'รับส่วนลด 20% สำหรับการซื้อครั้งถัดไป']);
    rewardsSheet.appendRow([200, 'ของรางวัลพิเศษ', 'รับของรางวัลพิเศษจากทางร้าน']);
  }

  var redemptionsSheet = ss.getSheetByName(SHEET_REDEMPTIONS);
  if (!redemptionsSheet) {
    redemptionsSheet = ss.insertSheet(SHEET_REDEMPTIONS);
    redemptionsSheet.appendRow(['id','phone','cycle','total_points','reward_name','redeemed_date','redeemed_by']);
    redemptionsSheet.getRange('1:1').setFontWeight('bold');
  }
  redemptionsSheet.getRange('B:B').setNumberFormat('@STRING@');
}

// ==================== FIX EXISTING DATA ====================
// รันฟังก์ชันนี้ 1 ครั้งใน Apps Script เพื่อแก้ข้อมูลเก่า
function fixSheetData() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // --- Points sheet ---
  var ps = ss.getSheetByName(SHEET_POINTS);
  if (ps && ps.getLastRow() > 1) {
    // ล็อก format column B (phone) และ C (date)
    ps.getRange('B:B').setNumberFormat('@STRING@');
    ps.getRange('C:C').setNumberFormat('@STRING@');

    var lastRow = ps.getLastRow();

    // แก้ phone (column B): เติม 0 นำถ้าหาย, แปลงเป็น string
    var phoneRange = ps.getRange(2, 2, lastRow - 1, 1);
    var phoneVals  = phoneRange.getValues();
    var fixedPhones = phoneVals.map(function(r){ return [toPhone(r[0])]; });
    phoneRange.setValues(fixedPhones);

    // แก้ date (column C): แปลง Date object → 'YYYY-MM-DD' string
    var dateRange = ps.getRange(2, 3, lastRow - 1, 1);
    var dateVals  = dateRange.getValues();
    var fixedDates = dateVals.map(function(r){ return [toDate(r[0])]; });
    dateRange.setValues(fixedDates);

    // แก้ cycle (column E): แปลงเป็น number
    var cycleRange = ps.getRange(2, 5, lastRow - 1, 1);
    var cycleVals  = cycleRange.getValues();
    var fixedCycles = cycleVals.map(function(r){ return [toNum(r[0])]; });
    cycleRange.setValues(fixedCycles);
  }

  // --- Redemptions sheet ---
  var rs = ss.getSheetByName(SHEET_REDEMPTIONS);
  if (rs && rs.getLastRow() > 1) {
    rs.getRange('B:B').setNumberFormat('@STRING@');
    var rLastRow = rs.getLastRow();
    var rPhoneRange = rs.getRange(2, 2, rLastRow - 1, 1);
    var rPhoneVals  = rPhoneRange.getValues();
    var rFixed = rPhoneVals.map(function(r){ return [toPhone(r[0])]; });
    rPhoneRange.setValues(rFixed);
  }

  Logger.log('fixSheetData done');
}

// ==================== WEB APP ====================
function doGet(e)  { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  var params = e.parameter || {};
  var action = params.action || '';
  var result;
  try {
    switch (action) {
      case 'generateToken': result = generateToken(params); break;
      case 'validateToken': result = validateToken(params); break;
      case 'addPoints':     result = addPoints(params);     break;
      case 'getPoints':     result = getPoints(params);     break;
      case 'getRewards':    result = getRewards();          break;
      case 'getStats':      result = getStats(params);      break;
      case 'redeemReward':  result = redeemReward(params);  break;
      case 'setup':
        setupSheets();
        result = { success: true, message: 'Sheets ready' };
        break;
      default:
        result = { success: false, message: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { success: false, message: err.toString() };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==================== HMAC TOKEN ====================
function generateHMAC(date) {
  var raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, date + SECRET_KEY
  );
  return raw.map(function(b){ return ('0'+(b&0xFF).toString(16)).slice(-2); }).join('');
}

function generateToken(params) {
  if (params.password !== ADMIN_PASSWORD)
    return { success: false, message: 'รหัสผ่านไม่ถูกต้อง' };
  var date = params.date || Utilities.formatDate(new Date(),'Asia/Bangkok','yyyy-MM-dd');
  return { success: true, token: generateHMAC(date), date: date };
}

function validateToken(params) {
  var date  = params.date  || '';
  var token = params.token || '';
  var today = Utilities.formatDate(new Date(),'Asia/Bangkok','yyyy-MM-dd');
  if (date !== today)
    return { success: false, message: 'QR Code หมดอายุ ใช้ได้เฉพาะวันที่สร้างเท่านั้น' };
  if (token !== generateHMAC(date))
    return { success: false, message: 'QR Code ไม่ถูกต้อง' };
  return { success: true, date: date };
}

// ==================== WRITE ROW (ป้องกัน auto-convert) ====================
function writePointsRow(sheet, values) {
  // กำหนด format ก่อน แล้วค่อย appendRow เพื่อป้องกัน Sheets แปลง phone/date
  var nextRow = sheet.getLastRow() + 1;
  sheet.getRange(nextRow, 2).setNumberFormat('@STRING@'); // phone
  sheet.getRange(nextRow, 3).setNumberFormat('@STRING@'); // date
  sheet.appendRow(values);
}

function writeRedemptionRow(sheet, values) {
  var nextRow = sheet.getLastRow() + 1;
  sheet.getRange(nextRow, 2).setNumberFormat('@STRING@'); // phone
  sheet.appendRow(values);
}

// ==================== POINTS ====================
function addPoints(params) {
  var phone = normalizePhone(params.phone || '');
  var date  = params.date  || '';
  var token = params.token || '';

  if (!phone || phone.length !== 10 || !/^0\d{9}$/.test(phone))
    return { success: false, message: 'กรุณาระบุเบอร์โทรศัพท์ 10 หลัก (เริ่มด้วย 0)' };

  var tv = validateToken({ date: date, token: token });
  if (!tv.success) return tv;

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var ps = ss.getSheetByName(SHEET_POINTS);
  var data = ps.getDataRange().getValues();
  var currentCycle = getCurrentCycle(phone, ss);

  // นับสแกนวันนี้ใน cycle ปัจจุบัน
  var scansToday = 0;
  for (var i = 1; i < data.length; i++) {
    if (toPhone(data[i][1]) === phone &&
        toDate(data[i][2])  === date  &&
        toNum(data[i][4])   === currentCycle) {
      scansToday++;
    }
  }

  if (scansToday >= MAX_SCANS_PER_DAY) {
    var pi = calculatePoints(phone, currentCycle, ss);
    return {
      success: false,
      alreadyScanned: true,
      message: 'คุณสะสมแต้มครบ ' + MAX_SCANS_PER_DAY + ' ครั้งในวันนี้แล้ว',
      scansToday: scansToday,
      remainingScans: 0,
      totalPoints: pi.totalPoints,
      rewards: pi.rewards
    };
  }

  // เขียนแถวใหม่ (ใช้ writePointsRow ป้องกัน auto-convert)
  var newId   = data.length;
  var ts      = Utilities.formatDate(new Date(),'Asia/Bangkok','yyyy-MM-dd HH:mm:ss');
  writePointsRow(ps, [newId, phone, date, POINTS_PER_SCAN, currentCycle, ts]);

  var pointsInfo    = calculatePoints(phone, currentCycle, ss);
  var remainingScans = MAX_SCANS_PER_DAY - (scansToday + 1);

  return {
    success: true,
    message: 'สะสมแต้มสำเร็จ! +' + POINTS_PER_SCAN + ' แต้ม',
    scansToday: scansToday + 1,
    remainingScans: remainingScans,
    totalPoints: pointsInfo.totalPoints,
    rewards: pointsInfo.rewards
  };
}

function getCurrentCycle(phone, ss) {
  var rd   = ss.getSheetByName(SHEET_REDEMPTIONS).getDataRange().getValues();
  var maxC = 0;
  for (var i = 1; i < rd.length; i++) {
    if (toPhone(rd[i][1]) === phone) {
      var c = toNum(rd[i][2]);
      if (c > maxC) maxC = c;
    }
  }
  return maxC > 0 ? maxC + 1 : 1;
}

function calculatePoints(phone, cycle, ss) {
  var data = ss.getSheetByName(SHEET_POINTS).getDataRange().getValues();
  var total = 0;
  for (var i = 1; i < data.length; i++) {
    if (toPhone(data[i][1]) === phone && toNum(data[i][4]) === cycle) {
      total += toNum(data[i][3]);
    }
  }

  var rwd  = ss.getSheetByName(SHEET_REWARDS).getDataRange().getValues();
  var list = [];
  for (var j = 1; j < rwd.length; j++) {
    var minPts = toNum(rwd[j][0]);
    list.push({
      minPoints:    minPts,
      name:         String(rwd[j][1]),
      detail:       String(rwd[j][2]),
      achieved:     total >= minPts,
      pointsNeeded: Math.max(0, minPts - total)
    });
  }
  list.sort(function(a,b){ return a.minPoints - b.minPoints; });
  return { totalPoints: total, rewards: list };
}

function getPoints(params) {
  var phone = normalizePhone(params.phone || '');
  if (!phone) return { success: false, message: 'กรุณาระบุเบอร์โทรศัพท์' };
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var cycle = getCurrentCycle(phone, ss);
  var pi    = calculatePoints(phone, cycle, ss);
  return { success: true, phone: phone, cycle: cycle,
           totalPoints: pi.totalPoints, rewards: pi.rewards };
}

function getRewards() {
  var data = SpreadsheetApp.openById(SPREADSHEET_ID)
               .getSheetByName(SHEET_REWARDS).getDataRange().getValues();
  var list = [];
  for (var i = 1; i < data.length; i++) {
    list.push({ minPoints: toNum(data[i][0]),
                name:      String(data[i][1]),
                detail:    String(data[i][2]) });
  }
  list.sort(function(a,b){ return a.minPoints - b.minPoints; });
  return { success: true, rewards: list };
}

// ==================== ADMIN STATS ====================
function getStats(params) {
  if (params.password !== ADMIN_PASSWORD)
    return { success: false, message: 'รหัสผ่านไม่ถูกต้อง' };

  var ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
  var data = ss.getSheetByName(SHEET_POINTS).getDataRange().getValues();
  var rdData = ss.getSheetByName(SHEET_REDEMPTIONS).getDataRange().getValues();

  var page        = parseInt(params.page)     || 1;
  var pageSize    = parseInt(params.pageSize) || 20;
  var filterPhone = normalizePhone(params.filterPhone || '');
  var filterDate  = params.filterDate  || '';
  var filterMonth = params.filterMonth || '';

  var map = {};
  for (var i = 1; i < data.length; i++) {
    var phone  = toPhone(data[i][1]);
    var date   = toDate(data[i][2]);
    var points = toNum(data[i][3]);
    var cycle  = toNum(data[i][4]);

    if (filterPhone && phone !== filterPhone) continue;
    if (filterDate  && date  !== filterDate)  continue;
    if (filterMonth && date.indexOf(filterMonth) !== 0) continue;

    var key = phone + '_' + cycle;
    if (!map[key]) {
      map[key] = { phone: phone, cycle: cycle, totalPoints: 0,
                   scanCount: 0, lastScan: '', redeemed: false,
                   redeemedDate: '', redeemedReward: '' };
    }
    map[key].totalPoints += points;
    map[key].scanCount   += 1;
    if (date > map[key].lastScan) map[key].lastScan = date;
  }

  // สถานะแลกรางวัล
  for (var j = 1; j < rdData.length; j++) {
    var rp  = toPhone(rdData[j][1]);
    var rc  = toNum(rdData[j][2]);
    var key2 = rp + '_' + rc;
    if (map[key2]) {
      map[key2].redeemed      = true;
      map[key2].redeemedDate  = toDate(rdData[j][5]);
      map[key2].redeemedReward = String(rdData[j][4]);
    }
  }

  var list = Object.values(map);
  list.sort(function(a, b) {
    var pa = String(a.phone), pb = String(b.phone);
    if (pa === pb) return b.cycle - a.cycle;
    return pa < pb ? -1 : pa > pb ? 1 : 0;
  });

  var total      = list.length;
  var totalPages = Math.ceil(total / pageSize) || 1;
  var start      = (page - 1) * pageSize;

  return {
    success: true,
    users: list.slice(start, start + pageSize),
    pagination: { page: page, pageSize: pageSize,
                  totalItems: total, totalPages: totalPages }
  };
}

// ==================== REDEEM ====================
function redeemReward(params) {
  if (params.password !== ADMIN_PASSWORD)
    return { success: false, message: 'รหัสผ่านไม่ถูกต้อง' };

  var phone = normalizePhone(params.phone || '');
  if (!phone) return { success: false, message: 'กรุณาระบุเบอร์โทรศัพท์' };

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var cycle = getCurrentCycle(phone, ss);
  var pi    = calculatePoints(phone, cycle, ss);

  if (pi.totalPoints === 0)
    return { success: false, message: 'ผู้ใช้ยังไม่มีแต้มสะสม' };

  var rs      = ss.getSheetByName(SHEET_REDEMPTIONS);
  var newId   = rs.getLastRow();
  var redDate = Utilities.formatDate(new Date(),'Asia/Bangkok','yyyy-MM-dd HH:mm:ss');
  var rwName  = params.rewardName || 'มอบรางวัล';

  writeRedemptionRow(rs, [newId, phone, cycle, pi.totalPoints, rwName, redDate, 'admin']);

  return {
    success: true,
    message: 'มอบรางวัลสำเร็จ! เบอร์ ' + phone + ' เริ่มสะสมแต้มรอบใหม่ได้',
    phone: phone, cycle: cycle,
    totalPoints: pi.totalPoints, rewardName: rwName
  };
}

// ==================== UTILITIES ====================
function normalizePhone(phone) {
  return String(phone).replace(/[^0-9]/g, '');
}
