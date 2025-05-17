// 调试日志功能
let debugMode = false;
const logger = {
    log: function(message) {
        if (!debugMode) return;
        
        console.log(message);
        const logPanel = document.getElementById('logPanel');
        if (logPanel) {
            const timestamp = new Date().toLocaleTimeString();
            const formattedMessage = typeof message === 'object' ? 
                JSON.stringify(message, null, 2) : message;
            
            logPanel.innerHTML += `[${timestamp}] ${formattedMessage}\n`;
            logPanel.scrollTop = logPanel.scrollHeight;
        }
    }
};

// localStorage操作封装
const storage = {
    set: (key, value) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            logger.log(`Storage set: ${key}`);
            checkStorageSpace();
        } catch (e) {
            logger.log(`Storage error: ${e.message}`);
            alert('存储失败，可能是存储空间不足。');
        }
    },
    get: (key) => {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : null;
        } catch (e) {
            logger.log(`Storage get error: ${e.message}`);
            return null;
        }
    },
    remove: (key) => {
        localStorage.removeItem(key);
        logger.log(`Storage removed: ${key}`);
    },
    clear: () => {
        localStorage.clear();
        logger.log('Storage cleared');
    }
};

// 检查存储空间
function checkStorageSpace() {
    let totalSpace = 5 * 1024 * 1024; // 假设总空间为5MB
    let usedSpace = 0;
    
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        usedSpace += (key.length + value.length) * 2; // UTF-16 编码，2字节/字符
    }
    
    const remainingPercentage = (totalSpace - usedSpace) / totalSpace * 100;
    logger.log(`存储空间: 已用 ${(usedSpace/1024/1024).toFixed(2)}MB, 剩余 ${remainingPercentage.toFixed(2)}%`);
    
    if (remainingPercentage < 20) {
        logger.log('存储空间不足，开始清理旧数据');
        document.getElementById('storageWarning').classList.remove('hidden');
        cleanupOldData();
    } else {
        document.getElementById('storageWarning').classList.add('hidden');
    }
}

// 清理旧数据
function cleanupOldData() {
    const taskDates = Object.keys(localStorage)
        .filter(k => Date.parse(k))
        .map(k => ({
            date: new Date(k),
            key: k
        }))
        .sort((a, b) => a.date - b.date); // 按日期从旧到新排序
    
    const now = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(now.getFullYear() - 1);
    
    // 一年内的旧任务保留简化数据，一年前的任务删除
    taskDates.forEach(task => {
        const data = storage.get(task.key);
        if (!data) return;
        
        if (task.date < oneYearAgo) {
            // 超过一年的任务，删除数据但保留任务完成状态
            if (data.submitted) {
                storage.set('completed_count', (storage.get('completed_count') || 0) + 1);
                storage.remove(task.key);
                logger.log(`已删除超过一年的任务数据: ${task.key}`);
            }
        } else if (data.submitted && !data.simplified) {
            // 一年内的已完成任务，简化数据
            const simplifiedData = {
                submitted: true,
                correctCount: data.correctCount,
                totalQuestions: data.totalQuestions,
                simplified: true // 标记已简化
            };
            storage.set(task.key, simplifiedData);
            logger.log(`已简化数据: ${task.key}`);
        }
    });
    
    // 更新统计数据
    updateStats();
}

// 系统状态
let currentDate = new Date();
let viewDate = new Date();
let currentQuestions = [];
let answerAttempts = {};
let attemptCounts = {};

function init() {
    logger.log('初始化应用');
    
    // 加载设置
    const settings = storage.get('system_settings') || {};
    debugMode = settings.debugMode || false;
    
    if (debugMode) {
        document.getElementById('logPanel').classList.remove('hidden');
    }
    
    // 初始化当天任务
    const todayKey = formatDateKey(new Date());
    if (!storage.get(todayKey)) {
        storage.set(todayKey, {
            submitted: false,
            correctCount: 0,
            totalQuestions: 0
        });
        logger.log(`创建今日任务: ${todayKey}`);
    }
    
    // 显示/隐藏同步按钮
    if (settings.syncUrl) {
        document.getElementById('syncButton').style.display = 'block';
    } else {
        document.getElementById('syncButton').style.display = 'none';
    }
    
    loadSettings();
    setupWeekdayLabels();
    generateCalendar();
    updateStats();
    showView('calendar');
    checkStorageSpace();
}

function formatDateKey(date) {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD 格式
}

function showView(viewName) {
    logger.log(`切换视图: ${viewName}`);
    
    if (viewName === 'settings') {
        showSettingsWithPasswordCheck();
        return;
    }
    
    document.querySelectorAll('.main-container > div').forEach(el => el.classList.add('hidden'));
    document.getElementById(viewName+'View').classList.remove('hidden');
    
    if(viewName === 'tasks') refreshTaskList();
}

function setupWeekdayLabels() {
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const container = document.getElementById('weekdayLabels');
    container.innerHTML = '';
    
    weekdays.forEach(day => {
        const cell = document.createElement('div');
        cell.className = 'weekday-label';
        cell.textContent = day;
        container.appendChild(cell);
    });
}

function generateCalendar() {
    logger.log('生成日历');
    const calendar = document.getElementById('calendar');
    calendar.innerHTML = '';
    
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDay = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // 计算日历起始日期（上个月的部分日期）
    const startDate = new Date(year, month, 1 - startDay);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 生成日历单元格
    for (let i = 0; i < 42; i++) {
        const cellDate = new Date(startDate);
        cellDate.setDate(startDate.getDate() + i);
        
        const isCurrentMonth = cellDate.getMonth() === month;
        const isPastOrToday = cellDate <= today;
        const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6;
        
        const cell = document.createElement('div');
        cell.className = 'calendar-cell';
        
        if (isWeekend) cell.classList.add('weekend');
        if (!isCurrentMonth) cell.classList.add('other-month');
        if (cellDate.toDateString() === today.toDateString()) cell.classList.add('current-day');
        
        // 只有当月且不是未来日期的单元格可点击
        if (isCurrentMonth && isPastOrToday) {
            cell.classList.add('clickable');
            cell.onclick = () => showTaskDetail(cellDate);
        } else if (isCurrentMonth && !isPastOrToday) {
            cell.classList.add('future-date');
        }

        cell.innerHTML = `
            <div>${cellDate.getDate()}</div>
            ${isCurrentMonth ? renderScoreIndicator(cellDate) : ''}
        `;
        
        calendar.appendChild(cell);
    }

    document.getElementById('currentMonth').textContent = 
        `${year}年 ${month + 1}月`;
}

function renderScoreIndicator(date) {
    const dateKey = formatDateKey(date);
    const record = storage.get(dateKey) || {};
    
    if (!record.submitted || !record.totalQuestions) return '';
    
    const percentage = record.correctCount / record.totalQuestions;
    let statusClass = 'medium-score';
    if (percentage >= 0.8) statusClass = 'high-score';
    else if (percentage < 0.6) statusClass = 'low-score';

    return `<div class="score-indicator ${statusClass}">
        ${record.correctCount}/${record.totalQuestions}
    </div>`;
}

async function showTaskDetail(date) {
    logger.log(`显示任务详情: ${formatDateKey(date)}`);
    currentDate = date;
    answerAttempts = {};
    attemptCounts = {};
    
    const dateKey = formatDateKey(date);
    const record = storage.get(dateKey) || { submitted: false };
    
    document.getElementById('taskDate').textContent = date.toLocaleDateString();
    document.getElementById('submitBtn').style.display = record.submitted ? 'none' : 'block';
    
    try {
        // 如果是已简化数据，显示简化提示
        if (record.simplified) {
            document.getElementById('questionsContainer').innerHTML = 
                `<div class="question-item">
                    <div class="question-title">该任务数据已简化归档。</div>
                    <div class="user-answer">
                        得分: ${record.correctCount}/${record.totalQuestions}
                    </div>
                </div>`;
            showView('taskDetail');
            return;
        }
        
        // 获取题目
        currentQuestions = await fetchQuestions(date);
        
        // 如果任务记录中没有题目总数，则更新
        if (!record.totalQuestions && currentQuestions.length > 0) {
            record.totalQuestions = currentQuestions.length;
            storage.set(dateKey, record);
        }
        
        renderQuestions(record);
    } catch(e) {
        logger.log(`获取题目失败: ${e.message}`);
        document.getElementById('questionsContainer').innerHTML = 
            `<div class="error-hint">获取题目失败: ${e.message}</div>`;
    }

    showView('taskDetail');
}

function renderQuestions(record) {
    logger.log('渲染题目');
    const container = document.getElementById('questionsContainer');
    
    if (!currentQuestions || currentQuestions.length === 0) {
        container.innerHTML = '<div class="error-hint">暂无题目</div>';
        return;
    }
    
    container.innerHTML = currentQuestions.map((q, i) => `
        <div class="question-item ${record.submitted ? 'locked' : ''}" id="q${q.id}">
            <div class="question-title">题目 ${i+1}: ${q.question}</div>
            ${renderInput(q, record)}
            ${record.submitted ? renderResult(q, record) : ''}
            ${!record.submitted ? `<button class="nav-button" style="margin-top:8px;" onclick="checkAnswer(${q.id})">确定</button>` : ''}
            <div class="error-hint" id="hint${q.id}"></div>
        </div>
    `).join('');
}

function renderInput(q, record) {
    if (record.submitted) {
        return `<input class="form-control" value="${record.answers?.[q.id]?.answer || ''}" readonly>`;
    }
    
    const currentValue = answerAttempts[q.id] || '';
    
    if (q.type === 'select') {
        return `
            <select class="form-control" onchange="recordAnswer(${q.id}, this.value)">
                <option value="">请选择</option>
                ${(q.options || []).map(o => `
                    <option ${currentValue === o ? 'selected' : ''}>${o}</option>
                `).join('')}
            </select>
        `;
    } else {
        return `
            <input class="form-control" type="text" 
                value="${currentValue}"
                oninput="recordAnswer(${q.id}, this.value)"
                placeholder="${q.hint || '请输入答案'}">
        `;
    }
}

function renderResult(q, record) {
    const answer = record.answers?.[q.id] || {};
    const userAnswer = answer.answer || '未回答';
    const isCorrect = answer.correct;
    
    let html = `
        <div class="user-answer" style="color: ${isCorrect ? 'green' : 'red'}">
            你的答案: ${userAnswer} ${isCorrect ? '✓' : '✗'}
        </div>
    `;
    
    if (!isCorrect) {
        html += `
            <div class="correct-answer">
                正确答案: ${q.answer}
            </div>
        `;
    }
    
    if (q.thinking) {
        html += `
            <details>
                <summary>思考过程</summary>
                <div class="thinking-process">${q.thinking}</div>
            </details>
        `;
    }
    
    return html;
}

function recordAnswer(questionId, value) {
    logger.log(`记录答案 - 题目ID:${questionId}, 答案:${value}`);
    answerAttempts[questionId] = value;
}

function checkAnswer(qId) {
    const question = currentQuestions.find(q => q.id === qId);
    if (!question) {
        logger.log(`题目ID不存在: ${qId}`);
        return;
    }
    
    const input = document.querySelector(`#q${qId} input, #q${qId} select`);
    const userAnswer = input.value.trim();
    const hint = document.getElementById(`hint${qId}`);
    
    if(!userAnswer) {
        hint.textContent = '请输入答案';
        return;
    }
    
    logger.log(`检查答案 - 题目ID:${qId}, 用户答案:${userAnswer}, 正确答案:${question.answer}`);
    attemptCounts[qId] = (attemptCounts[qId] || 0) + 1;
    
    const answerMatch = userAnswer.toLowerCase() === question.answer.toLowerCase();
    
    if(answerMatch) {
        hint.textContent = '✓ 回答正确！';
        hint.style.color = 'green';
        input.disabled = true;

        // 显示正确答案和思考过程
        const container = document.getElementById(`q${qId}`);
        const answerDiv = document.createElement('div');
        answerDiv.className = 'correct-answer';
        answerDiv.innerHTML = `正确答案: ${question.answer}`;
        container.appendChild(answerDiv);
        
        if (question.thinking) {
            const thinkingDiv = document.createElement('details');
            thinkingDiv.innerHTML = `
                <summary>思考过程</summary>
                <div class="thinking-process">${question.thinking}</div>
            `;
            container.appendChild(thinkingDiv);
        }
    } else {
        if(attemptCounts[qId] >= 2) {
            hint.textContent = '✗ 答案不正确，已锁定';
            hint.style.color = 'red';
            input.disabled = true;
            
            // 显示正确答案和思考过程
            const container = document.getElementById(`q${qId}`);
            const answerDiv = document.createElement('div');
            answerDiv.className = 'correct-answer';
            answerDiv.innerHTML = `正确答案: ${question.answer}`;
            container.appendChild(answerDiv);
            
            if (question.thinking) {
                const thinkingDiv = document.createElement('details');
                thinkingDiv.innerHTML = `
                    <summary>思考过程</summary>
                    <div class="thinking-process">${question.thinking}</div>
                `;
                container.appendChild(thinkingDiv);
            }
        } else {
            hint.textContent = '提示：' + (question.hint || '答案不正确，请再试一次');
            hint.style.color = '#856404';
        }
    }
}

function submitAnswers() {
    logger.log('提交答案');
    
    if (!confirm("确定要提交答案吗？提交后将无法修改。")) {
        return;
    }
    
    if (!currentQuestions || currentQuestions.length === 0) {
        alert('没有题目可提交');
        return;
    }
    
    // 检查所有问题是否已回答
    const unansweredQuestions = currentQuestions.filter(q => !answerAttempts[q.id]);
    if (unansweredQuestions.length > 0) {
        alert(`还有 ${unansweredQuestions.length} 道题目未完成，请完成所有题目后再提交。`);
        return;
    }
    
    const results = {};
    let correctCount = 0;
    
    currentQuestions.forEach(q => {
        const userAnswer = answerAttempts[q.id] || '';
        const isCorrect = userAnswer.toLowerCase() === q.answer.toLowerCase();
        
        results[q.id] = { 
            answer: userAnswer,
            correct: isCorrect
        };
        
        if (isCorrect) correctCount++;
    });

    const dateKey = formatDateKey(currentDate);
    const record = {
        submitted: true,
        correctCount,
        totalQuestions: currentQuestions.length,
        questions: currentQuestions, // 保存题目
        answers: results,
        submitTime: new Date().toISOString()
    };

    storage.set(dateKey, record);
    updateStats();
    generateCalendar();
    showTaskDetail(currentDate);
}

function refreshTaskList() {
    logger.log('刷新任务列表');
    const tasks = Object.keys(localStorage)
        .filter(k => k.match(/^\d{4}-\d{2}-\d{2}$/)) // 筛选日期格式的key
        .map(k => ({
            date: new Date(k),
            key: k,
            data: storage.get(k)
        }))
        .sort((a,b) => b.date - a.date); // 按日期从新到旧排序

    // 检查并确保今天的任务存在
    const today = new Date();
    const todayKey = formatDateKey(today);
    let todayTask = tasks.find(t => t.key === todayKey);
    
    if (!todayTask) {
        // 创建今天的任务
        storage.set(todayKey, {
            submitted: false,
            correctCount: 0,
            totalQuestions: 0
        });
        
        todayTask = {
            date: today,
            key: todayKey,
            data: storage.get(todayKey)
        };
        
        // 将今天的任务添加到列表
        tasks.unshift(todayTask);
    }

    const taskList = document.getElementById('taskList');
    taskList.innerHTML = '';

    // 当天任务
    const todayEl = document.createElement('div');
    todayEl.className = `task-item ${!todayTask.data.submitted ? 'urgent' : ''}`;
    todayEl.innerHTML = `
        <div onclick="showTaskDetail(new Date('${todayTask.date.toISOString()}'))">
            ${todayTask.date.toLocaleDateString()} 
            ${!todayTask.data.submitted ? '(今日未完成)' : '(已完成)'}
        </div>
        <button class="nav-button" onclick="refreshTask('${todayTask.key}')">重做</button>
    `;
    taskList.appendChild(todayEl);

    // 历史任务
    tasks.filter(t => t.key !== todayKey).forEach(t => {
        const taskEl = document.createElement('div');
        taskEl.className = 'task-item';
        taskEl.onclick = () => showTaskDetail(new Date(t.date));
        
        let statusText = '';
        if (t.data.submitted) {
            statusText = `(${t.data.correctCount}/${t.data.totalQuestions})`;
        } else {
            statusText = '(未完成)';
        }
        
        taskEl.innerHTML = `${t.date.toLocaleDateString()} ${statusText}`;
        taskList.appendChild(taskEl);
    });
}

function refreshTask(dateKey) {
    logger.log(`重做任务: ${dateKey}`);
    if (!confirm("您确定要重做吗？这将删除已有的答案数据。"))
        return;
    
    storage.remove(dateKey);
    storage.set(dateKey, {
        submitted: false,
        correctCount: 0,
        totalQuestions: 0
    });
    
    refreshTaskList();
    
    // 如果是当天的任务，直接显示
    const today = formatDateKey(new Date());
    if (dateKey === today) {
        showTaskDetail(new Date());
    }
}

function updateApiUrlBasedOnModel(model) {
    const urlField = document.getElementById('apiUrl');
    const currentUrl = urlField.value;
    
    // 如果用户已经手动填写了URL，且不是选择了新的模型，则不修改
    if (currentUrl && model === document.getElementById('apiModel').dataset.lastModel) {
        return;
    }
    
    // 保存当前选择的模型，用于检测是否是用户手动修改
    document.getElementById('apiModel').dataset.lastModel = model;
    
    // 根据模型更新URL
    switch(model) {
        case 'gpt-3.5-turbo':
            urlField.value = 'https://api.openai.com/v1/chat/completions';
            break;
        case 'gpt-4':
            urlField.value = 'https://api.openai.com/v1/chat/completions';
            break;
        case 'deepseek-chat':
            urlField.value = 'https://api.deepseek.com/v1/chat/completions';
            break;
        case 'qwen-max':
            urlField.value = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';
            break;
        case 'custom':
            // 如果是自定义模型，不自动填充URL
            break;
        default:
            // 其他情况不修改URL
            break;
    }
}

// 密码验证功能
function verifyPassword() {
    const settingsPassword = document.getElementById('settingsPassword').value;
    const storedPassword = storage.get('settings_password');
    
    // 如果没有设置密码，则设置新密码
    if (!storedPassword) {
        if (settingsPassword.trim() === '') {
            alert('请设置一个访问密码');
            return;
        }
        
        storage.set('settings_password', settingsPassword);
        document.getElementById('passwordProtection').classList.add('hidden');
        document.getElementById('settingsContent').classList.remove('hidden');
        logger.log('设置了新的访问密码');
        return;
    }
    
    // 验证密码
    if (settingsPassword === storedPassword) {
        document.getElementById('passwordProtection').classList.add('hidden');
        document.getElementById('settingsContent').classList.remove('hidden');
        logger.log('密码验证成功');
    } else {
        alert('密码不正确');
        logger.log('密码验证失败');
    }
}

// 显示设置页面前检查密码
function showSettingsWithPasswordCheck() {
    document.querySelectorAll('.main-container > div').forEach(el => el.classList.add('hidden'));
    document.getElementById('settingsView').classList.remove('hidden');
    
    const storedPassword = storage.get('settings_password');
    if (storedPassword) {
        // 已设置密码，需要验证
        document.getElementById('passwordProtection').classList.remove('hidden');
        document.getElementById('settingsContent').classList.add('hidden');
        document.getElementById('settingsPassword').value = '';
    } else {
        // 首次使用，设置密码
        document.getElementById('passwordProtection').classList.remove('hidden');
        document.getElementById('settingsContent').classList.add('hidden');
    }
    
    if (debugMode) {
        document.getElementById('logPanel').classList.remove('hidden');
    }
}

function loadSettings() {
    logger.log('加载设置');
    const settings = storage.get('system_settings') || {};
    
    document.getElementById('apiModel').value = settings.apiModel || 'gpt-3.5-turbo';
    document.getElementById('apiUrl').value = settings.apiUrl || '';
    document.getElementById('apiKey').value = settings.apiKey || '';
    document.getElementById('apiPrompt').value = settings.apiPrompt ||
`请为一个小学五年级的学生提供每日打卡的题目，内容是关于语文常识，古文，诗词和国学。
要求如下：
1. 生成2个选择题和1个填空题。
2. 选择题有4到6个备选答案，一个正确答案。
3. 填空题尽可能让答案是明确和唯一的，避免主观题导致不容易判断回答对错。
4. 每道题包括以下信息：
      a. 问题
      b. 答案
   c. 提示 
      d. 解题思路
5. 提示可以帮助用户解答题目，但是要避免直接透露答案本身。
6. 解题思路可以帮助用户理解答案，提高解决类似题目的能力。
7. 所有题目的信息用JSON格式返回。例如：
[
    {
        "id": 1,
        "type": "select",
        "question": "一星期有几天？",
        "options": ["1", "2", "7", "6"],
        "answer": "7",
        "hint": "查看下日历",
        "thinking": "这是一个关于日期的简单选择题，可以通过查看日历了解。"
    },
    {
        "id": 2,
        "type": "input",
        "question": "一年有几个月？（请用阿拉伯数字回答）",
        "answer": "12",
        "hint": "一年有365天，一个月大概有30天。",
        "thinking": "这是一个关于日期的简单选择题，可以通过查看日历了解。"
    }
]
8. 确保返回正确的json并且可以被Python json.loads方法解析.

请生成题目:
`;
    document.getElementById('syncUrl').value = settings.syncUrl || '';
    document.getElementById('debugMode').checked = settings.debugMode || false;
    
    // 根据选择的模型自动填充URL
    updateApiUrlBasedOnModel(settings.apiModel);
    
    // 显示/隐藏同步按钮
    if (settings.syncUrl) {
        document.getElementById('syncButton').style.display = 'block';
    } else {
        document.getElementById('syncButton').style.display = 'none';
    }
}

function saveSettings() {
    logger.log('保存设置');
    
    const settings = {
        apiModel: document.getElementById('apiModel').value,
        apiUrl: document.getElementById('apiUrl').value,
        apiKey: document.getElementById('apiKey').value,
        apiPrompt: document.getElementById('apiPrompt').value,
        syncUrl: document.getElementById('syncUrl').value,
        debugMode: document.getElementById('debugMode').checked
    };
    
    storage.set('system_settings', settings);
    debugMode = settings.debugMode;
    
    if (debugMode) {
        document.getElementById('logPanel').classList.remove('hidden');
    } else {
        document.getElementById('logPanel').classList.add('hidden');
    }
    
    // 显示/隐藏同步按钮
    if (settings.syncUrl) {
        document.getElementById('syncButton').style.display = 'block';
    } else {
        document.getElementById('syncButton').style.display = 'none';
    }
    
    alert('设置已保存');
}

function updateStats() {
    logger.log('更新统计数据');
    const savedCompletedCount = storage.get('completed_count') || 0;
    
    const currentCompletedCount = Object.keys(localStorage)
        .filter(k => k.match(/^\d{4}-\d{2}-\d{2}$/))
        .map(k => storage.get(k))
        .filter(data => data && data.submitted)
        .length;
    
    const totalCompleted = savedCompletedCount + currentCompletedCount;
    document.getElementById('completedCount').textContent = totalCompleted;
}

// 显示/隐藏加载指示器
function toggleLoading(show, message = '正在加载题目...') {
    const loader = document.getElementById('loadingIndicator');
    const loadingText = document.querySelector('.loading-text');
    
    if (show) {
        loadingText.textContent = message;
        loader.classList.remove('hidden');
    } else {
        loader.classList.add('hidden');
    }
}

async function fetchQuestions(date) {
    logger.log(`获取题目 - 日期:${formatDateKey(date)}`);
    const settings = storage.get('system_settings') || {};
    
    // 如果已经有存储的题目，直接返回
    const dateKey = formatDateKey(date);
    const existing = storage.get(dateKey);
    if (existing && existing.questions) {
        logger.log('使用缓存的题目');
        return existing.questions;
    }
    
    // 如果没有配置API或者是历史数据，使用测试数据
    if (!settings.apiUrl || !settings.apiKey) {
        logger.log('使用默认测试数据');
        return getDefaultQuestions(date);
    }
    
    try {
        // 显示加载指示器
        toggleLoading(true, '正在从API获取题目...');
        
        // 构建API请求
        const prompt = settings.apiPrompt;
        const model = settings.apiModel;
        
        // 根据不同的模型构建不同的请求
        let requestBody;
        
        if (model.startsWith('qwen')) {
            // 阿里云千问模型请求格式
            requestBody = JSON.stringify({
                model: model,
                input: {
                    messages: [
                        {
                            role: "user",
                            content: `${prompt}`
                        }
                    ]
                },
                parameters: {
                    temperature: 0.7
                }
            });
        } else {
            // OpenAI、DeepSeek等模型请求格式
            requestBody = JSON.stringify({
                model: model,
                messages: [
                    {
                        role: "user",
                        content: `${prompt}`
                    }
                ],
                temperature: 0.7
            });
        }
        
        // 添加不同模型的认证头
        let headers = {
            'Content-Type': 'application/json'
        };
        
        if (model.startsWith('qwen')) {
            headers['Authorization'] = `Bearer ${settings.apiKey}`;
        } else if (model.startsWith('deepseek')) {
            headers['Authorization'] = `Bearer ${settings.apiKey}`;
        } else {
            headers['Authorization'] = `Bearer ${settings.apiKey}`;
        }
        
        const response = await fetch(settings.apiUrl, {
            method: 'POST',
            headers: headers,
            body: requestBody
        });
        
        if (!response.ok) {
            throw new Error(`API错误: ${response.status}\nURL:${settings.apiUrl}\nrequestBody:${requestBody}`);
        }
        
        const data = await response.json();
        // 解析返回的内容，转换为题目格式

        const questions = extractAndParseJSON(data.choices[0].message.content)
        if (!questions) {
            throw new Error(`questions错误: prompt:${prompt}, resp: ${data.choices[0].message.content}`);
        }
        
        // 存储题目到本地
        const record = storage.get(dateKey) || { submitted: false };
        record.questions = questions;
        record.totalQuestions = questions.length;
        storage.set(dateKey, record);
        
        // 隐藏加载指示器
        toggleLoading(false);
        
        return questions;
    } catch (e) {
        logger.log(`API请求失败: ${e.message}`);
        // 隐藏加载指示器
        toggleLoading(false);
        // 出错时使用默认题目
        throw new Error(`API请求失败: ${e.message}`)
    }
}

// 解析API返回的题目
function parseQuestions(content) {
    logger.log('解析题目内容');
    // 这里实现一个简单的解析逻辑，实际可能需要根据API返回格式调整
    try {
        // 尝试直接解析JSON
        if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
            return JSON.parse(content);
        }
        
        // 否则进行文本解析（简单实现，可能需要更复杂的逻辑）
        const questions = [];
        let currentQ = null;
        
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // 检测新题目
            if (line.match(/^题目\s*\d+/) || line.match(/^问题\s*\d+/) || line.match(/^[0-9]+[\.\、]/) || line.match(/^Q\d+/)) {
                if (currentQ) questions.push(currentQ);
                
                currentQ = {
                    id: questions.length + 1,
                    question: line.replace(/^题目\s*\d+[\.:]?\s*|^问题\s*\d+[\.:]?\s*|^[0-9]+[\.\、]\s*|^Q\d+[\.:]?\s*/i, ''),
                    type: 'input',
                    thinking: ''
                };
            } 
            // 检测选项
            else if (line.match(/^[A-D][\.。\)）]\s*/) && currentQ) {
                if (!currentQ.options) {
                    currentQ.options = [];
                    currentQ.type = 'select';
                }
                currentQ.options.push(line.replace(/^[A-D][\.。\)）]\s*/, ''));
            }
            // 检测答案
            else if ((line.match(/^答案[:：]/) || line.match(/^正确答案[:：]/)) && currentQ) {
                currentQ.answer = line.replace(/^答案[:：]\s*|^正确答案[:：]\s*/, '');
                // 对于选择题，可能只给了选项字母
                if (currentQ.type === 'select' && currentQ.answer.match(/^[A-D]$/)) {
                    const index = currentQ.answer.charCodeAt(0) - 'A'.charCodeAt(0);
                    if (currentQ.options && index >= 0 && index < currentQ.options.length) {
                        currentQ.answer = currentQ.options[index];
                    }
                }
            }
            // 检测提示
            else if (line.match(/^提示[:：]/) && currentQ) {
                currentQ.hint = line.replace(/^提示[:：]\s*/, '');
            }
            // 检测思考过程
            else if ((line.match(/^思考过程[:：]/) || line.match(/^解析[:：]/)) && currentQ) {
                let thinking = line.replace(/^思考过程[:：]\s*|^解析[:：]\s*/, '');
                // 收集多行思考过程
                let j = i + 1;
                while (j < lines.length && !lines[j].match(/^题目\s*\d+|^问题\s*\d+|^[0-9]+[\.\、]|^Q\d+|^答案[:：]|^提示[:：]|^思考过程[:：]|^解析[:：]/)) {
                    thinking += '\n' + lines[j];
                    j++;
                }
                i = j - 1; // 调整索引
                currentQ.thinking = thinking;
            }
        }
        
        if (currentQ) questions.push(currentQ);
        
        // 如果没有解析出题目，使用默认题目
        if (questions.length === 0) {
            throw new Error('无法解析题目');
        }
        
        return questions;
    } catch (e) {
        logger.log(`解析题目失败: ${e.message}`);
        return getDefaultQuestions(new Date());
    }
}

// 获取默认题目
function getDefaultQuestions(date) {
    const weekday = ['日','一','二','三','四','五','六'][date.getDay()];
    const dateStr = formatDateKey(date);
    
    return [
        {
            id: 1,
            type: 'select',
            question: "今天的正确日期是？",
            options: [dateStr, "昨天", "明天"],
            answer: dateStr,
            hint: "查看当前日期",
            thinking: "这是一个关于日期的简单选择题，答案就是当前日期。"
        },
        {
            id: 2,
            type: 'input',
            question: `今天是星期${weekday}，用拼音表示（如xingqiyi）`,
            answer: `xingqi${['ri','yi','er','san','si','wu','liu'][date.getDay()]}`,
            hint: "格式：xingqi...",
            thinking: "拼音表示为：星期一(xingqiyi), 星期二(xingqier), 星期三(xingqisan), 星期四(xingqisi), 星期五(xingqiwu), 星期六(xingqiliu), 星期日(xingqiri)"
        },
        {
            id: 3,
            type: 'select',
            question: "下列哪个不是JavaScript的数据类型？",
            options: ["String", "Number", "Character", "Boolean"],
            answer: "Character",
            hint: "JavaScript有6种基本数据类型",
            thinking: "JavaScript的基本数据类型包括：String(字符串), Number(数字), Boolean(布尔), Undefined(未定义), Null(空), Symbol(符号,ES6新增)。其中没有Character(字符)类型，这是其他语言如Java中的类型。"
        },
        {
            id: 4,
            type: 'input',
            question: "HTML5的全称是什么？",
            answer: "HyperText Markup Language 5",
            hint: "超文本标记语言的第5版",
            thinking: "HTML是HyperText Markup Language(超文本标记语言)的缩写，HTML5是它的第5个主要版本，所以全称为HyperText Markup Language 5。"
        },
        {
            id: 5,
            type: 'input',
            question: "CSS中，使用什么选择器可以选择所有元素？",
            answer: "*",
            hint: "这是一个通配符",
            thinking: "在CSS中，通配选择器(Universal Selector)使用星号(*)表示，可以选择文档中的所有元素。"
        }
    ];
}

function changeMonth(offset) {
    logger.log(`切换月份: ${offset}`);
    viewDate.setMonth(viewDate.getMonth() + offset);
    generateCalendar();
}

function hideTask() {
    logger.log('关闭任务详情');
    showView('calendar');
    generateCalendar();
}

// 下载数据
function downloadData() {
    logger.log('下载数据');
    
    // 收集所有任务数据
    const data = {};
    Object.keys(localStorage).forEach(key => {
        if (key === 'system_settings') {
            // 不导出API密钥
            const settings = storage.get(key);
            if (settings) {
                data[key] = { ...settings, apiKey: '***' };
            }
        } else {
            data[key] = storage.get(key);
        }
    });
    
    // 创建下载链接
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `task_data_${formatDateKey(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    
    // 清理
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 0);
}

// 上传数据
function uploadData() {
    logger.log('上传数据');
    document.getElementById('uploadFile').click();
}

// 处理文件上传
function handleFileUpload() {
    const fileInput = document.getElementById('uploadFile');
    const file = fileInput.files[0];
    
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            if (!confirm(`确定要导入数据吗？这将覆盖当前所有数据。`)) {
                return;
            }
            
            // 清空现有数据
            storage.clear();
            
            // 导入数据
            Object.keys(data).forEach(key => {
                // 不导入API密钥
                if (key === 'system_settings' && data[key].apiKey === '***') {
                    const currentSettings = storage.get('system_settings') || {};
                    data[key].apiKey = currentSettings.apiKey || '';
                }
                storage.set(key, data[key]);
            });
            
            alert('数据导入成功');
            loadSettings();
            generateCalendar();
            updateStats();
            
        } catch (error) {
            logger.log(`导入数据失败: ${error.message}`);
            alert('导入失败，文件格式不正确');
        }
    };
    reader.readAsText(file);
    
    // 重置文件输入
    fileInput.value = '';
}

// 添加数据同步功能
async function syncData() {
    logger.log('开始同步数据');
    const settings = storage.get('system_settings') || {};
    
    if (!settings.syncUrl) {
        alert('请先在设置中配置数据同步 URL');
        return;
    }
    
    try {
        toggleLoading(true, '正在同步数据...');
        
        // 收集所有任务数据，除了密码
        const data = {};
        Object.keys(localStorage).forEach(key => {
            if (key !== 'settings_password') { // 不同步密码
                data[key] = storage.get(key);
            }
        });
        
        // 添加设备标识和时间戳
        const syncData = {
            deviceId: getDeviceId(),
            timestamp: new Date().toISOString(),
            data: data
        };
        
        // 发送同步请求
        const response = await fetch(settings.syncUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(syncData)
        });
        
        if (!response.ok) {
            throw new Error(`同步失败: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            // 如果服务器返回了更新的数据，则更新本地存储
            if (result.data) {
                Object.keys(result.data).forEach(key => {
                    // 更新本地存储，但不更新密码
                    if (key !== 'settings_password' || !storage.get('settings_password')) {
                        storage.set(key, result.data[key]);
                    }
                });
                
                // 如果服务器返回了密码，并且本地没有密码，则设置密码
                if (result.password && !storage.get('settings_password')) {
                    storage.set('settings_password', result.password);
                }
            }
            
            alert('数据同步成功');
            // 更新页面显示
            updateStats();
            generateCalendar();
            loadSettings();
            
            if (document.getElementById('tasksView').classList.contains('hidden') === false) {
                refreshTaskList();
            }
        } else {
            throw new Error(result.message || '同步失败');
        }
    } catch (e) {
        logger.log(`同步数据失败: ${e.message}`);
        alert(`同步失败: ${e.message}`);
    } finally {
        toggleLoading(false);
    }
}

// 获取设备唯一标识
function getDeviceId() {
    let deviceId = storage.get('device_id');
    if (!deviceId) {
        deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
        storage.set('device_id', deviceId);
    }
    return deviceId;
}

// 初始化应用
window.onload = init;
