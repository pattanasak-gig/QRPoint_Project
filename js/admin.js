// ==================== CONFIG ====================
const API_URL = 'https://script.google.com/macros/s/AKfycbxoksd8JWdFnglrr6h7LkozZlZm89pSTjPvnVPAUtxivhthOVUq3K-yKsgDsUey2Foq/exec';
const ADMIN_PASSWORD = '@admin1234';

// ==================== API HELPER ====================
async function callAPI(params) {
  const query = Object.entries(params)
    .map(function(entry) { return encodeURIComponent(entry[0]) + '=' + encodeURIComponent(entry[1]); })
    .join('&');
  const response = await fetch(API_URL + '?' + query, { redirect: 'follow' });
  return await response.json();
}

// ==================== STATE ====================
let isLoggedIn = false;
let currentPage = 1;
let rewardsCache = [];

// ==================== BASE URL ====================
function getBaseURL() {
  const loc = window.location;
  return loc.protocol + '//' + loc.host + loc.pathname.replace(/\/[^/]*$/, '/');
}

// ==================== LOGIN ====================
function login() {
  const password = document.getElementById('passwordInput').value;
  if (password === ADMIN_PASSWORD) {
    isLoggedIn = true;
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('dashboardSection').classList.remove('hidden');
    document.getElementById('loginError').classList.add('hidden');

    const today = new Date();
    const todayStr = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');
    document.getElementById('qrDate').value = todayStr;

    loadRewards();
  } else {
    document.getElementById('loginError').classList.remove('hidden');
  }
}

function logout() {
  isLoggedIn = false;
  document.getElementById('loginSection').classList.remove('hidden');
  document.getElementById('dashboardSection').classList.add('hidden');
  document.getElementById('passwordInput').value = '';
}

// ==================== TABS ====================
function switchTab(tab) {
  document.getElementById('qrTab').classList.add('hidden');
  document.getElementById('statsTab').classList.add('hidden');
  document.getElementById('tabQR').classList.remove('active');
  document.getElementById('tabStats').classList.remove('active');

  if (tab === 'qr') {
    document.getElementById('qrTab').classList.remove('hidden');
    document.getElementById('tabQR').classList.add('active');
  } else {
    document.getElementById('statsTab').classList.remove('hidden');
    document.getElementById('tabStats').classList.add('active');
    loadStats(1);
  }
}

// ==================== GENERATE QR ====================
async function generateQR() {
  const date = document.getElementById('qrDate').value;
  if (!date) {
    alert('กรุณาเลือกวันที่');
    return;
  }

  const genBtn = document.getElementById('genQRBtn');
  const genText = document.getElementById('genQRText');
  const genLoading = document.getElementById('genQRLoading');

  genBtn.disabled = true;
  genText.textContent = 'กำลังสร้าง...';
  genLoading.classList.remove('hidden');

  try {
    const data = await callAPI({
      action: 'generateToken',
      date: date,
      password: ADMIN_PASSWORD
    });

    if (data.success) {
      displayQR(data.token, data.date);
    } else {
      alert(data.message || 'เกิดข้อผิดพลาด');
    }
  } catch (error) {
    alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
  } finally {
    genBtn.disabled = false;
    genText.textContent = 'สร้าง QR Code';
    genLoading.classList.add('hidden');
  }
}

function displayQR(token, date) {
  const scanURL = getBaseURL() + 'scan.html?token=' + encodeURIComponent(token) + '&date=' + encodeURIComponent(date);

  const qr = qrcode(0, 'M');
  qr.addData(scanURL);
  qr.make();

  const qrDisplay = document.getElementById('qrDisplay');
  qrDisplay.innerHTML = qr.createImgTag(6, 16);

  document.getElementById('qrDateLabel').textContent = 'QR Code สำหรับวันที่ ' + formatDateThai(date);
  document.getElementById('qrLinkText').textContent = scanURL;
  document.getElementById('qrResult').classList.remove('hidden');

  qrDisplay.dataset.scanUrl = scanURL;
}

function downloadQR() {
  const qrDisplay = document.getElementById('qrDisplay');
  const img = qrDisplay.querySelector('img');
  if (!img) return;

  const canvas = document.createElement('canvas');
  const size = 400;
  canvas.width = size;
  canvas.height = size + 60;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const tempImg = new Image();
  tempImg.onload = function() {
    ctx.drawImage(tempImg, 20, 20, size - 40, size - 40);
    ctx.fillStyle = '#333';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    const date = document.getElementById('qrDate').value;
    ctx.fillText('QRPoint - ' + formatDateThai(date), size / 2, size + 30);

    const link = document.createElement('a');
    link.download = 'QRPoint_' + date + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };
  tempImg.src = img.src;
}

function copyQRLink() {
  const linkText = document.getElementById('qrLinkText').textContent;
  navigator.clipboard.writeText(linkText).then(function() {
    document.getElementById('qrLinkDisplay').classList.remove('hidden');
    alert('คัดลอกลิงก์แล้ว');
  }).catch(function() {
    document.getElementById('qrLinkDisplay').classList.remove('hidden');
    const range = document.createRange();
    range.selectNode(document.getElementById('qrLinkText'));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });
}

// ==================== LOAD REWARDS ====================
async function loadRewards() {
  try {
    const data = await callAPI({ action: 'getRewards' });
    if (data.success) {
      rewardsCache = data.rewards;
    }
  } catch (e) {
    console.error('Failed to load rewards:', e);
  }
}

// ==================== STATS ====================
async function loadStats(page) {
  if (!isLoggedIn) return;
  currentPage = page || 1;

  const filterPhone = document.getElementById('filterPhone').value.replace(/[^0-9]/g, '');
  const filterDate = document.getElementById('filterDate').value;
  const filterMonth = document.getElementById('filterMonth').value;
  const pageSize = document.getElementById('pageSize').value;

  const statsBody = document.getElementById('statsBody');
  const statsLoading = document.getElementById('statsLoading');
  const pagination = document.getElementById('pagination');

  statsBody.innerHTML = '';
  statsLoading.classList.remove('hidden');
  pagination.innerHTML = '';

  try {
    const apiParams = {
      action: 'getStats',
      password: ADMIN_PASSWORD,
      page: currentPage,
      pageSize: pageSize
    };
    if (filterPhone) apiParams.filterPhone = filterPhone;
    if (filterDate) apiParams.filterDate = filterDate;
    if (filterMonth) apiParams.filterMonth = filterMonth;

    const data = await callAPI(apiParams);

    if (data.success) {
      renderStats(data.users, data.pagination);
    } else {
      statsBody.innerHTML = '<tr><td colspan="7" class="text-center text-error">' + (data.message || 'เกิดข้อผิดพลาด') + '</td></tr>';
    }
  } catch (error) {
    statsBody.innerHTML = '<tr><td colspan="7" class="text-center text-error">ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้</td></tr>';
  } finally {
    statsLoading.classList.add('hidden');
  }
}

function renderStats(users, paginationInfo) {
  const statsBody = document.getElementById('statsBody');

  if (!users || users.length === 0) {
    statsBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">ไม่พบข้อมูล</td></tr>';
    return;
  }

  let html = '';
  users.forEach(function(user) {
    const statusBadge = user.redeemed
      ? '<span class="badge badge-redeemed">แลกแล้ว</span>'
      : '<span class="badge badge-active">กำลังสะสม</span>';

    const actionBtn = user.redeemed
      ? '<span class="text-muted">-</span>'
      : '<button class="btn btn-sm btn-success" onclick="openRedeemModal(\'' + user.phone + '\',' + user.totalPoints + ',' + user.cycle + ')">มอบรางวัล</button>';

    html += '<tr>' +
      '<td>' + formatPhone(user.phone) + '</td>' +
      '<td>' + user.cycle + '</td>' +
      '<td><strong>' + user.totalPoints + '</strong></td>' +
      '<td>' + user.scanCount + '</td>' +
      '<td>' + formatDateThai(user.lastScan) + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + actionBtn + '</td>' +
      '</tr>';
  });

  statsBody.innerHTML = html;
  renderPagination(paginationInfo);
}

function renderPagination(info) {
  const pagination = document.getElementById('pagination');
  if (!info || info.totalPages <= 1) return;

  let html = '';

  if (info.page > 1) {
    html += '<button class="page-btn" onclick="loadStats(' + (info.page - 1) + ')">&laquo;</button>';
  }

  const startPage = Math.max(1, info.page - 2);
  const endPage = Math.min(info.totalPages, info.page + 2);

  for (let i = startPage; i <= endPage; i++) {
    html += '<button class="page-btn ' + (i === info.page ? 'active' : '') + '" onclick="loadStats(' + i + ')">' + i + '</button>';
  }

  if (info.page < info.totalPages) {
    html += '<button class="page-btn" onclick="loadStats(' + (info.page + 1) + ')">&raquo;</button>';
  }

  html += '<span style="padding:8px;color:#888;font-size:13px">(' + info.totalItems + ' รายการ)</span>';
  pagination.innerHTML = html;
}

function clearFilters() {
  document.getElementById('filterPhone').value = '';
  document.getElementById('filterDate').value = '';
  document.getElementById('filterMonth').value = '';
  loadStats(1);
}

// ==================== REDEEM MODAL ====================
function openRedeemModal(phone, totalPoints, cycle) {
  document.getElementById('modalPhone').textContent = formatPhone(phone);
  document.getElementById('modalPoints').textContent = totalPoints;
  document.getElementById('modalCycle').textContent = cycle;

  const select = document.getElementById('rewardSelect');
  select.innerHTML = '<option value="">-- เลือกรางวัล --</option>';

  rewardsCache.forEach(function(reward) {
    if (totalPoints >= reward.minPoints) {
      select.innerHTML += '<option value="' + reward.name + '">' + reward.name + ' (' + reward.minPoints + ' แต้ม) - ' + reward.detail + '</option>';
    }
  });

  if (select.options.length === 1) {
    select.innerHTML += '<option value="มอบรางวัลตามดุลพินิจ">มอบรางวัลตามดุลพินิจ</option>';
  }

  document.getElementById('redeemModal').dataset.phone = phone;
  document.getElementById('redeemModal').dataset.cycle = cycle;
  document.getElementById('redeemModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('redeemModal').classList.add('hidden');
}

async function confirmRedeem() {
  const modal = document.getElementById('redeemModal');
  const phone = modal.dataset.phone;
  const rewardName = document.getElementById('rewardSelect').value;

  if (!rewardName) {
    alert('กรุณาเลือกรางวัล');
    return;
  }

  if (!confirm('ยืนยันมอบรางวัล "' + rewardName + '" ให้เบอร์ ' + formatPhone(phone) + '?')) {
    return;
  }

  try {
    const data = await callAPI({
      action: 'redeemReward',
      phone: phone,
      rewardName: rewardName,
      password: ADMIN_PASSWORD
    });

    if (data.success) {
      alert(data.message);
      closeModal();
      loadStats(currentPage);
    } else {
      alert(data.message || 'เกิดข้อผิดพลาด');
    }
  } catch (error) {
    alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
  }
}

// ==================== HELPERS ====================
function formatPhone(phone) {
  if (phone && phone.length === 10) {
    return phone.substring(0, 3) + '-' + phone.substring(3, 6) + '-' + phone.substring(6);
  }
  return phone;
}

function formatDateThai(dateStr) {
  if (!dateStr) return '-';
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const day = parseInt(parts[2]);
  const month = months[parseInt(parts[1]) - 1];
  const year = parseInt(parts[0]) + 543;
  return day + ' ' + month + ' ' + year;
}
