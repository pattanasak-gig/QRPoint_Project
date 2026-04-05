// ==================== CONFIG ====================
const API_URL = 'https://script.google.com/macros/s/AKfycbxoksd8JWdFnglrr6h7LkozZlZm89pSTjPvnVPAUtxivhthOVUq3K-yKsgDsUey2Foq/exec';

// ==================== API HELPER ====================
async function callAPI(params) {
  const query = Object.entries(params)
    .map(function(entry) { return encodeURIComponent(entry[0]) + '=' + encodeURIComponent(entry[1]); })
    .join('&');
  const response = await fetch(API_URL + '?' + query, { redirect: 'follow' });
  return await response.json();
}

// ==================== INIT ====================
let qrToken = '';
let qrDate = '';

document.addEventListener('DOMContentLoaded', function() {
  const params = new URLSearchParams(window.location.search);
  qrToken = params.get('token') || '';
  qrDate = params.get('date') || '';

  if (!qrToken || !qrDate) {
    showError('ลิงก์ไม่ถูกต้อง กรุณาสแกน QR Code จากพนักงาน');
    return;
  }

  // ตรวจสอบว่า QR Code เป็นของวันนี้หรือไม่
  const today = new Date();
  const todayStr = today.getFullYear() + '-' +
    String(today.getMonth() + 1).padStart(2, '0') + '-' +
    String(today.getDate()).padStart(2, '0');

  if (qrDate !== todayStr) {
    showSection('expiredSection');
    return;
  }

  showSection('phoneSection');
  document.getElementById('phoneInput').focus();
});

// ==================== SUBMIT POINTS ====================
async function submitPoints() {
  const phone = document.getElementById('phoneInput').value.replace(/[^0-9]/g, '');

  if (!phone || phone.length !== 10 || !phone.startsWith('0')) {
    alert('กรุณาระบุเบอร์โทรศัพท์ 10 หลัก (เริ่มด้วย 0)');
    return;
  }

  const submitBtn = document.getElementById('submitBtn');
  const submitText = document.getElementById('submitText');
  const submitLoading = document.getElementById('submitLoading');

  submitBtn.disabled = true;
  submitText.textContent = 'กำลังบันทึก...';
  submitLoading.classList.remove('hidden');

  try {
    const data = await callAPI({
      action: 'addPoints',
      phone: phone,
      date: qrDate,
      token: qrToken
    });

    if (data.success || data.alreadyScanned) {
      showResult(data);
    } else {
      showError(data.message || 'เกิดข้อผิดพลาด');
    }
  } catch (error) {
    showError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่');
  } finally {
    submitBtn.disabled = false;
    submitText.textContent = 'สะสมแต้ม';
    submitLoading.classList.add('hidden');
  }
}

// ==================== DISPLAY RESULT ====================
function showResult(data) {
  showSection('resultSection');

  const resultAlert = document.getElementById('resultAlert');
  if (data.alreadyScanned) {
    resultAlert.innerHTML = '<div class="alert alert-warning"><span class="alert-icon">&#9888;&#65039;</span><div><strong>' + data.message + '</strong></div></div>';
  } else {
    resultAlert.innerHTML = '<div class="alert alert-success"><span class="alert-icon">&#9989;</span><div><strong>' + data.message + '</strong></div></div>';
  }

  document.getElementById('totalPoints').textContent = data.totalPoints;

  const rewardsSection = document.getElementById('rewardsSection');
  rewardsSection.innerHTML = '<h3 style="margin-bottom:12px">รางวัลที่สะสมได้</h3>';

  if (data.rewards && data.rewards.length > 0) {
    let foundNextTarget = false;
    data.rewards.forEach(function(reward) {
      const isAchieved = reward.achieved;
      const isNextTarget = !isAchieved && !foundNextTarget;
      if (isNextTarget) foundNextTarget = true;

      let extraClass = '';
      if (isAchieved) extraClass = 'achieved';
      else if (isNextTarget) extraClass = 'next-target';

      let statusHTML = '';
      if (isAchieved) {
        statusHTML = '<span class="reward-status achieved">&#10004; ถึงเกณฑ์แล้ว</span>';
      } else {
        statusHTML = '<span class="reward-status pending">อีก ' + reward.pointsNeeded + ' แต้ม</span>';
      }

      rewardsSection.innerHTML +=
        '<div class="reward-item ' + extraClass + '">' +
          '<span class="reward-icon">' + (isAchieved ? '&#127942;' : '&#127919;') + '</span>' +
          '<div class="reward-info">' +
            '<div class="reward-name">' + reward.name + ' (' + reward.minPoints + ' แต้ม)</div>' +
            '<div class="reward-detail">' + reward.detail + '</div>' +
          '</div>' +
          statusHTML +
        '</div>';
    });
  }
}

// ==================== HELPERS ====================
function showSection(sectionId) {
  ['expiredSection', 'phoneSection', 'resultSection', 'errorSection'].forEach(function(id) {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById(sectionId).classList.remove('hidden');
}

function showError(message) {
  document.getElementById('errorMessage').textContent = message;
  showSection('errorSection');
}

function resetForm() {
  document.getElementById('phoneInput').value = '';
  showSection('phoneSection');
  document.getElementById('phoneInput').focus();
}
