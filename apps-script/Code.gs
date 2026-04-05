// ==================== CONFIG ====================
const SPREADSHEET_ID = '1Isba08dIUNvDm_BLj05Z5Krntl2nvqdrqo5t6mA4hmw';
const ADMIN_PASSWORD = '@admin1234';
const SECRET_KEY = 'QRPoint_Secret_2026_!@#$';
const POINTS_PER_SCAN = 10;
const MAX_SCANS_PER_DAY = 2;

// ==================== SHEET NAMES ====================
const SHEET_POINTS = 'Points';
const SHEET_REWARDS = 'Rewards';
const SHEET_REDEMPTIONS = 'Redemptions';

// ==================== SETUP ====================
function setupSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  let pointsSheet = ss.getSheetByName(SHEET_POINTS);
  if (!pointsSheet) {
    pointsSheet = ss.insertSheet(SHEET_POINTS);
    pointsSheet.appendRow(['id', 'phone', 'date', 'points', 'cycle', 'timestamp']);
    pointsSheet.getRange('1:1').setFontWeight('bold');
    // ตั้งค่าคอลัมน์ phone (B) และ date (C) เป็น Plain Text ป้องกัน Sheets แปลงค่า
    pointsSheet.getRange('B:B').setNumberFormat('@STRING@');
    pointsSheet.getRange('C:C').setNumberFormat('@STRING@');
  }

  let rewardsSheet = ss.getSheetByName(SHEET_REWARDS);
  if (!rewardsSheet) {
    rewardsSheet = ss.insertSheet(SHEET_REWARDS);
    rewardsSheet.appendRow(['min_points', 'reward_name', 'reward_detail']);
    rewardsSheet.getRange('1:1').setFontWeight('bold');
    rewardsSheet.appendRow([50, 'ส่วนลด 10%', 'รับส่วนลด 10% สำหรับการซื้อครั้งถัดไป']);
    rewardsSheet.appendRow([100, 'ส่วนลด 20%', 'รับส่วนลด 20% สำหรับการซื้อครั้งถัดไป']);
    rewardsSheet.appendRow([200, 'ของรางวัลพิเศษ', 'รับของรางวัลพิเศษจากทางร้าน']);
  }

  let redemptionsSheet = ss.getSheetByName(SHEET_REDEMPTIONS);
  if (!redemptionsSheet) {
    redemptionsSheet = ss.insertSheet(SHEET_REDEMPTIONS);
    redemptionsSheet.appendRow(['id', 'phone', 'cycle', 'total_points', 'reward_name', 'redeemed_date', 'redeemed_by']);
    redemptionsSheet.getRange('1:1').setFontWeight('bold');
    redemptionsSheet.getRange('B:B').setNumberFormat('@STRING@');
  }
}

// ==================== WEB APP ====================
function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  const params = e.parameter || {};
  const action = params.action || '';

  let result;
  try {
    switch (action) {
      case 'generateToken':  result = generateToken(params);  break;
      case 'validateToken':  result = validateToken(params);  break;
      case 'addPoints':      result = addPoints(params);      break;
      case 'getPoints':      result = getPoints(params);      break;
      case 'getRewards':     result = getRewards();           break;
      case 'getStats':       result = getStats(params);       break;
      case 'redeemReward':   result = redeemReward(params);   break;
      case 'setup':
        setupSheets();
        result = { success: true, message: 'Sheets created successfully' };
        break;
      default:
        result = { success: false, message: 'Invalid action: ' + action };
    }
  } catch (error) {
    result = { success: false, message: error.toString() };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==================== HELPERS: แปลงค่าจาก Sheets ====================
// Google Sheets อาจเก็บ phone เป็น number และ date เป็น Date object
function cellToPhone(val) {
  // แปลงเป็น string แล้ว zero-pad ให้ครบ 10 หลัก
  var str = String(val).replace(/[^0-9]/g, '');
  // ถ้าขาด leading 0 (เช่น Sheets ตัด 0 ออก) ให้เติมกลับ
  if (str.length === 9) str = '0' + str;
  return str;
}

function cellToDate(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Bangkok', 'yyyy-MM-dd');
  }
  return String(val);
}

function cellToNumber(val) {
  return Number(val);
}

// ==================== HMAC TOKEN ====================
function generateHMAC(date) {
  const message = date + SECRET_KEY;
  const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, message);
  return rawHash.map(function(b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

function generateToken(params) {
  if (params.password !== ADMIN_PASSWORD) {
    return { success: false, message: 'รหัสผ่านไม่ถูกต้อง' };
  }
  const date = params.date || Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
  const token = generateHMAC(date);
  return { success: true, token: token, date: date };
}

function validateToken(params) {
  const date = params.date || '';
  const token = params.token || '';

  const today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
  if (date !== today) {
    return { success: false, message: 'QR Code หมดอายุ ใช้ได้เฉพาะวันที่สร้างเท่านั้น' };
  }

  const expectedToken = generateHMAC(date);
  if (token !== expectedToken) {
    return { success: false, message: 'QR Code ไม่ถูกต้อง' };
  }

  return { success: true, message: 'QR Code ถูกต้อง', date: date };
}

// ==================== POINTS ====================
function addPoints(params) {
  const phone = normalizePhone(params.phone || '');
  const date = params.date || '';
  const token = params.token || '';

  if (!phone || phone.length !== 10 || !/^0\d{9}$/.test(phone)) {
    return { success: false, message: 'กรุณาระบุเบอร์โทรศัพท์ 10 หลัก (เริ่มด้วย 0)' };
  }

  const tokenValidation = validateToken({ date: date, token: token });
  if (!tokenValidation.success) {
    return tokenValidation;
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const pointsSheet = ss.getSheetByName(SHEET_POINTS);
  const data = pointsSheet.getDataRange().getValues();
  const currentCycle = getCurrentCycle(phone, ss);

  // นับจำนวนครั้งที่สแกนวันนี้ใน cycle ปัจจุบัน
  let scansToday = 0;
  for (let i = 1; i < data.length; i++) {
    const rowPhone = cellToPhone(data[i][1]);
    const rowDate  = cellToDate(data[i][2]);
    const rowCycle = cellToNumber(data[i][4]);

    if (rowPhone === phone && rowDate === date && rowCycle === currentCycle) {
      scansToday++;
    }
  }

  if (scansToday >= MAX_SCANS_PER_DAY) {
    const pointsInfo = calculatePoints(phone, currentCycle, ss);
    return {
      success: false,
      message: 'คุณได้สะสมแต้มครบ ' + MAX_SCANS_PER_DAY + ' ครั้งแล้วในวันนี้',
      alreadyScanned: true,
      scansToday: scansToday,
      totalPoints: pointsInfo.totalPoints,
      rewards: pointsInfo.rewards
    };
  }

  // เพิ่มแต้ม
  const newId = data.length;
  const timestamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  pointsSheet.appendRow([newId, phone, date, POINTS_PER_SCAN, currentCycle, timestamp]);

  const pointsInfo = calculatePoints(phone, currentCycle, ss);
  const remainingScans = MAX_SCANS_PER_DAY - (scansToday + 1);

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
  const redemptionsSheet = ss.getSheetByName(SHEET_REDEMPTIONS);
  const redemptionsData = redemptionsSheet.getDataRange().getValues();

  let maxCycle = 0;
  for (let i = 1; i < redemptionsData.length; i++) {
    const rowPhone = cellToPhone(redemptionsData[i][1]);
    const rowCycle = cellToNumber(redemptionsData[i][2]);
    if (rowPhone === phone && rowCycle > maxCycle) {
      maxCycle = rowCycle;
    }
  }

  return maxCycle > 0 ? maxCycle + 1 : 1;
}

function calculatePoints(phone, cycle, ss) {
  const pointsSheet = ss.getSheetByName(SHEET_POINTS);
  const data = pointsSheet.getDataRange().getValues();

  let totalPoints = 0;
  for (let i = 1; i < data.length; i++) {
    const rowPhone = cellToPhone(data[i][1]);
    const rowCycle = cellToNumber(data[i][4]);
    if (rowPhone === phone && rowCycle === cycle) {
      totalPoints += cellToNumber(data[i][3]);
    }
  }

  const rewardsSheet = ss.getSheetByName(SHEET_REWARDS);
  const rewardsData = rewardsSheet.getDataRange().getValues();

  let rewards = [];
  for (let i = 1; i < rewardsData.length; i++) {
    const minPts = cellToNumber(rewardsData[i][0]);
    rewards.push({
      minPoints: minPts,
      name: String(rewardsData[i][1]),
      detail: String(rewardsData[i][2]),
      achieved: totalPoints >= minPts,
      pointsNeeded: Math.max(0, minPts - totalPoints)
    });
  }

  rewards.sort(function(a, b) { return a.minPoints - b.minPoints; });
  return { totalPoints: totalPoints, rewards: rewards };
}

function getPoints(params) {
  const phone = normalizePhone(params.phone || '');
  if (!phone) {
    return { success: false, message: 'กรุณาระบุเบอร์โทรศัพท์' };
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const currentCycle = getCurrentCycle(phone, ss);
  const pointsInfo = calculatePoints(phone, currentCycle, ss);

  return {
    success: true,
    phone: phone,
    cycle: currentCycle,
    totalPoints: pointsInfo.totalPoints,
    rewards: pointsInfo.rewards
  };
}

function getRewards() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const rewardsSheet = ss.getSheetByName(SHEET_REWARDS);
  const data = rewardsSheet.getDataRange().getValues();

  let rewards = [];
  for (let i = 1; i < data.length; i++) {
    rewards.push({
      minPoints: cellToNumber(data[i][0]),
      name: String(data[i][1]),
      detail: String(data[i][2])
    });
  }

  rewards.sort(function(a, b) { return a.minPoints - b.minPoints; });
  return { success: true, rewards: rewards };
}

// ==================== ADMIN STATS ====================
function getStats(params) {
  if (params.password !== ADMIN_PASSWORD) {
    return { success: false, message: 'รหัสผ่านไม่ถูกต้อง' };
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const pointsSheet = ss.getSheetByName(SHEET_POINTS);
  const data = pointsSheet.getDataRange().getValues();
  const redemptionsSheet = ss.getSheetByName(SHEET_REDEMPTIONS);
  const redemptionsData = redemptionsSheet.getDataRange().getValues();

  const page = parseInt(params.page) || 1;
  const pageSize = parseInt(params.pageSize) || 20;
  const filterPhone = normalizePhone(params.filterPhone || '');
  const filterDate = params.filterDate || '';
  const filterMonth = params.filterMonth || '';

  let usersMap = {};
  for (let i = 1; i < data.length; i++) {
    const phone = cellToPhone(data[i][1]);
    const date  = cellToDate(data[i][2]);
    const points = cellToNumber(data[i][3]);
    const cycle = cellToNumber(data[i][4]);

    if (filterPhone && phone !== filterPhone) continue;
    if (filterDate && date !== filterDate) continue;
    if (filterMonth && !date.startsWith(filterMonth)) continue;

    const key = phone + '_' + cycle;
    if (!usersMap[key]) {
      usersMap[key] = {
        phone: phone,
        cycle: cycle,
        totalPoints: 0,
        scanCount: 0,
        lastScan: '',
        redeemed: false,
        redeemedDate: '',
        redeemedReward: ''
      };
    }
    usersMap[key].totalPoints += points;
    usersMap[key].scanCount += 1;
    if (date > usersMap[key].lastScan) {
      usersMap[key].lastScan = date;
    }
  }

  // ตรวจสอบสถานะแลกรางวัล
  for (let i = 1; i < redemptionsData.length; i++) {
    const rPhone = cellToPhone(redemptionsData[i][1]);
    const rCycle = cellToNumber(redemptionsData[i][2]);
    const key = rPhone + '_' + rCycle;
    if (usersMap[key]) {
      usersMap[key].redeemed = true;
      usersMap[key].redeemedDate = cellToDate(redemptionsData[i][5]);
      usersMap[key].redeemedReward = String(redemptionsData[i][4]);
    }
  }

  let usersList = Object.values(usersMap);
  // เรียงตามเบอร์โทร (String) แล้วตาม cycle ล่าสุดก่อน
  usersList.sort(function(a, b) {
    const pa = String(a.phone);
    const pb = String(b.phone);
    if (pa === pb) return b.cycle - a.cycle;
    return pa < pb ? -1 : pa > pb ? 1 : 0;
  });

  const totalItems = usersList.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startIndex = (page - 1) * pageSize;
  const pagedUsers = usersList.slice(startIndex, startIndex + pageSize);

  return {
    success: true,
    users: pagedUsers,
    pagination: {
      page: page,
      pageSize: pageSize,
      totalItems: totalItems,
      totalPages: totalPages
    }
  };
}

// ==================== REDEEM ====================
function redeemReward(params) {
  if (params.password !== ADMIN_PASSWORD) {
    return { success: false, message: 'รหัสผ่านไม่ถูกต้อง' };
  }

  const phone = normalizePhone(params.phone || '');
  const rewardName = params.rewardName || '';

  if (!phone) {
    return { success: false, message: 'กรุณาระบุเบอร์โทรศัพท์' };
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const currentCycle = getCurrentCycle(phone, ss);
  const pointsInfo = calculatePoints(phone, currentCycle, ss);

  if (pointsInfo.totalPoints === 0) {
    return { success: false, message: 'ผู้ใช้ยังไม่มีแต้มสะสม' };
  }

  const redemptionsSheet = ss.getSheetByName(SHEET_REDEMPTIONS);
  const redemptionsData = redemptionsSheet.getDataRange().getValues();
  const newId = redemptionsData.length;
  const redeemedDate = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');

  redemptionsSheet.appendRow([
    newId,
    phone,
    currentCycle,
    pointsInfo.totalPoints,
    rewardName || 'มอบรางวัล',
    redeemedDate,
    'admin'
  ]);

  return {
    success: true,
    message: 'มอบรางวัลสำเร็จ! ผู้ใช้ ' + phone + ' สามารถเริ่มสะสมแต้มรอบใหม่ได้',
    phone: phone,
    cycle: currentCycle,
    totalPoints: pointsInfo.totalPoints,
    rewardName: rewardName
  };
}

// ==================== UTILITIES ====================
function normalizePhone(phone) {
  return String(phone).replace(/[^0-9]/g, '');
}
