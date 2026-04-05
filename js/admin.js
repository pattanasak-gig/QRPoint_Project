// ==================== CONFIG ====================
const API_URL = 'https://script.google.com/macros/s/AKfycbxoksd8JWdFnglrr6h7LkozZlZm89pSTjPvnVPAUtxivhthOVUq3K-yKsgDsUey2Foq/exec';
const ADMIN_PASSWORD = '@admin1234';

// ==================== API HELPER ====================
async function callAPI(params) {
  const query = Object.entries(params)
    .map(function(e) { return encodeURIComponent(e[0]) + '=' + encodeURIComponent(e[1]); })
    .join('&');
  const response = await fetch(API_URL + '?' + query, { redirect: 'follow' });
  return await response.json();
}

// ==================== STATE ====================
let isLoggedIn    = false;
let currentPage   = 1;
let currentPeriod = 'day';
let rewardsCache  = [];
let chartScans    = null;
let chartPoints   = null;
let chartRewards  = null;

const CHART_COLORS = ['#667eea','#f39c12','#27ae60','#e74c3c','#9b59b6','#1abc9c','#e67e22','#3498db'];
const TH_MONTHS    = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

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
    document.getElementById('qrDate').value = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');

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
  ['qr', 'stats', 'report'].forEach(function(t) {
    document.getElementById(t + 'Tab').classList.add('hidden');
    document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1)).classList.remove('active');
  });
  document.getElementById(tab + 'Tab').classList.remove('hidden');
  document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');

  if (tab === 'stats')  loadStats(1);
  if (tab === 'report') loadReport();
}

// ==================== GENERATE QR ====================
async function generateQR() {
  const date = document.getElementById('qrDate').value;
  if (!date) { alert('กรุณาเลือกวันที่'); return; }

  const genBtn     = document.getElementById('genQRBtn');
  const genText    = document.getElementById('genQRText');
  const genLoading = document.getElementById('genQRLoading');
  genBtn.disabled = true;
  genText.textContent = 'กำลังสร้าง...';
  genLoading.classList.remove('hidden');

  try {
    const data = await callAPI({ action: 'generateToken', date: date, password: ADMIN_PASSWORD });
    if (data.success) {
      displayQR(data.token, data.date);
    } else {
      alert(data.message || 'เกิดข้อผิดพลาด');
    }
  } catch (e) {
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
  const img = document.getElementById('qrDisplay').querySelector('img');
  if (!img) return;
  const size = 400;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size + 60;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const tmp = new Image();
  tmp.onload = function() {
    ctx.drawImage(tmp, 20, 20, size - 40, size - 40);
    ctx.fillStyle = '#333'; ctx.font = '16px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('QRPoint - ' + formatDateThai(document.getElementById('qrDate').value), size / 2, size + 30);
    const link = document.createElement('a');
    link.download = 'QRPoint_' + document.getElementById('qrDate').value + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };
  tmp.src = img.src;
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
    if (data.success) rewardsCache = data.rewards;
  } catch (e) { console.error('loadRewards:', e); }
}

// ==================== STATS ====================
async function loadStats(page) {
  if (!isLoggedIn) return;
  currentPage = page || 1;

  const filterPhone  = document.getElementById('filterPhone').value.replace(/[^0-9]/g, '');
  const filterStatus = document.getElementById('filterStatus').value;
  const filterDate   = document.getElementById('filterDate').value;
  const filterMonth  = document.getElementById('filterMonth').value;
  const pageSize     = document.getElementById('pageSize').value;

  const statsBody   = document.getElementById('statsBody');
  const statsLoading= document.getElementById('statsLoading');
  const pagination  = document.getElementById('pagination');

  statsBody.innerHTML = '';
  statsLoading.classList.remove('hidden');
  pagination.innerHTML = '';
  document.getElementById('userCountArea').classList.add('hidden');

  try {
    const apiParams = {
      action: 'getStats', password: ADMIN_PASSWORD,
      page: currentPage, pageSize: pageSize, filterStatus: filterStatus
    };
    if (filterPhone) apiParams.filterPhone = filterPhone;
    if (filterDate)  apiParams.filterDate  = filterDate;
    if (filterMonth) apiParams.filterMonth = filterMonth;

    const data = await callAPI(apiParams);

    if (data.success) {
      renderStats(data.users, data.pagination);
      // แสดงจำนวนผู้ใช้
      const countEl = document.getElementById('userCountNum');
      countEl.textContent = data.pagination.totalItems;
      document.getElementById('userCountArea').classList.remove('hidden');
    } else {
      statsBody.innerHTML = '<tr><td colspan="7" class="text-center text-error">' + (data.message || 'เกิดข้อผิดพลาด') + '</td></tr>';
    }
  } catch (e) {
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
    let statusBadge, actionBtn;

    if (user.redeemed) {
      statusBadge = '<span class="badge badge-redeemed">แลกแล้ว</span>';
      actionBtn   = '<span class="text-muted">-</span>';
    } else {
      // ตรวจว่าถึงเกณฑ์รางวัลหรือไม่
      const minPts = rewardsCache.length > 0 ? rewardsCache[0].minPoints : Infinity;
      if (user.totalPoints >= minPts) {
        statusBadge = '<span class="badge badge-eligible">ยังไม่แลกรางวัล</span>';
      } else {
        statusBadge = '<span class="badge badge-active">กำลังสะสม</span>';
      }
      actionBtn = '<button class="btn btn-sm btn-success" onclick="openRedeemModal(\'' +
        user.phone + '\',' + user.totalPoints + ',' + user.cycle + ')">มอบรางวัล</button>';
    }

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
  if (info.page > 1)
    html += '<button class="page-btn" onclick="loadStats(' + (info.page - 1) + ')">&laquo;</button>';
  const s = Math.max(1, info.page - 2), e = Math.min(info.totalPages, info.page + 2);
  for (let i = s; i <= e; i++)
    html += '<button class="page-btn ' + (i === info.page ? 'active' : '') + '" onclick="loadStats(' + i + ')">' + i + '</button>';
  if (info.page < info.totalPages)
    html += '<button class="page-btn" onclick="loadStats(' + (info.page + 1) + ')">&raquo;</button>';
  pagination.innerHTML = html;
}

function clearFilters() {
  document.getElementById('filterPhone').value  = '';
  document.getElementById('filterStatus').value = 'all';
  document.getElementById('filterDate').value   = '';
  document.getElementById('filterMonth').value  = '';
  loadStats(1);
}

// ==================== REDEEM MODAL ====================
function openRedeemModal(phone, totalPoints, cycle) {
  document.getElementById('modalPhone').textContent  = formatPhone(phone);
  document.getElementById('modalPoints').textContent = totalPoints;
  document.getElementById('modalCycle').textContent  = cycle;

  const select = document.getElementById('rewardSelect');
  select.innerHTML = '<option value="">-- เลือกรางวัล --</option>';
  rewardsCache.forEach(function(reward) {
    if (totalPoints >= reward.minPoints) {
      select.innerHTML += '<option value="' + reward.name + '">' +
        reward.name + ' (' + reward.minPoints + ' แต้ม) — ' + reward.detail + '</option>';
    }
  });
  select.innerHTML += '<option value="มอบรางวัลตามดุลพินิจ">มอบรางวัลตามดุลพินิจ</option>';

  document.getElementById('redeemModal').dataset.phone = phone;
  document.getElementById('redeemModal').dataset.cycle = cycle;
  document.getElementById('redeemModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('redeemModal').classList.add('hidden');
}

async function confirmRedeem() {
  const modal      = document.getElementById('redeemModal');
  const phone      = modal.dataset.phone;
  const rewardName = document.getElementById('rewardSelect').value;
  if (!rewardName) { alert('กรุณาเลือกรางวัล'); return; }
  if (!confirm('ยืนยันมอบรางวัล "' + rewardName + '" ให้เบอร์ ' + formatPhone(phone) + '?')) return;

  try {
    const data = await callAPI({
      action: 'redeemReward', phone: phone,
      rewardName: rewardName, password: ADMIN_PASSWORD
    });
    if (data.success) {
      alert(data.message);
      closeModal();
      loadStats(currentPage);
    } else {
      alert(data.message || 'เกิดข้อผิดพลาด');
    }
  } catch (e) {
    alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
  }
}

// ==================== REPORT ====================
function setPeriod(period) {
  currentPeriod = period;
  ['Day','Week','Month'].forEach(function(p) {
    document.getElementById('period' + p).classList.remove('active');
  });
  document.getElementById('period' + period.charAt(0).toUpperCase() + period.slice(1)).classList.add('active');
  loadReport();
}

async function loadReport() {
  if (!isLoggedIn) return;

  const loading = document.getElementById('reportLoading');
  const content = document.getElementById('reportContent');
  loading.classList.remove('hidden');
  content.style.opacity = '0.3';

  try {
    const data = await callAPI({
      action: 'getReport', password: ADMIN_PASSWORD, period: currentPeriod
    });
    if (data.success) {
      renderCharts(data);
    } else {
      alert(data.message || 'โหลดรายงานไม่สำเร็จ');
    }
  } catch (e) {
    alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
  } finally {
    loading.classList.add('hidden');
    content.style.opacity = '1';
  }
}

function renderCharts(data) {
  const labels = data.labels.map(function(l) { return formatChartLabel(l, data.period); });

  // ทำลาย chart เก่าก่อนสร้างใหม่
  if (chartScans)   { chartScans.destroy();   chartScans   = null; }
  if (chartPoints)  { chartPoints.destroy();  chartPoints  = null; }
  if (chartRewards) { chartRewards.destroy(); chartRewards = null; }

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { mode: 'index', intersect: false }
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 11 } } },
      y: { beginAtZero: true, ticks: { precision: 0 } }
    }
  };

  // Chart 1: จำนวนสแกน
  chartScans = new Chart(document.getElementById('chartScans'), {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'จำนวนสแกน',
        data: data.scans,
        borderColor: CHART_COLORS[0],
        backgroundColor: CHART_COLORS[0] + '22',
        fill: true,
        tension: 0.3,
        pointRadius: 4
      }]
    },
    options: Object.assign({}, chartOpts, {
      plugins: Object.assign({}, chartOpts.plugins, { legend: { display: false } })
    })
  });

  // Chart 2: จำนวนแต้ม
  chartPoints = new Chart(document.getElementById('chartPoints'), {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'แต้มสะสม',
        data: data.points,
        borderColor: CHART_COLORS[1],
        backgroundColor: CHART_COLORS[1] + '22',
        fill: true,
        tension: 0.3,
        pointRadius: 4
      }]
    },
    options: chartOpts
  });

  // Chart 3: รางวัล แยกเส้นตาม reward_name
  const noDataEl = document.getElementById('noRewardData');
  if (!data.rewards || data.rewards.length === 0) {
    noDataEl.classList.remove('hidden');
    // สร้าง chart เปล่า
    chartRewards = new Chart(document.getElementById('chartRewards'), {
      type: 'line',
      data: { labels: labels, datasets: [] },
      options: chartOpts
    });
  } else {
    noDataEl.classList.add('hidden');
    const datasets = data.rewards.map(function(series, idx) {
      return {
        label: series.name,
        data: series.data,
        borderColor: CHART_COLORS[idx % CHART_COLORS.length],
        backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] + '22',
        fill: false,
        tension: 0.3,
        pointRadius: 4
      };
    });
    chartRewards = new Chart(document.getElementById('chartRewards'), {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: Object.assign({}, chartOpts, {
        plugins: Object.assign({}, chartOpts.plugins, {
          legend: { display: true, position: 'top' }
        })
      })
    });
  }
}

function formatChartLabel(label, period) {
  if (period === 'month') {
    const p    = label.split('-');
    const mon  = TH_MONTHS[parseInt(p[1]) - 1];
    const yr   = (parseInt(p[0]) + 543).toString().slice(-2);
    return mon + yr;
  }
  const p   = label.split('-');
  const day = parseInt(p[2]);
  const mon = TH_MONTHS[parseInt(p[1]) - 1];
  return day + ' ' + mon;
}

// ==================== HELPERS ====================
function formatPhone(phone) {
  const s = String(phone);
  return s.length === 10
    ? s.substring(0,3) + '-' + s.substring(3,6) + '-' + s.substring(6)
    : s;
}

function formatDateThai(dateStr) {
  if (!dateStr) return '-';
  const p = String(dateStr).split('-');
  if (p.length < 3) return dateStr;
  return parseInt(p[2]) + ' ' + TH_MONTHS[parseInt(p[1]) - 1] + ' ' + (parseInt(p[0]) + 543);
}
