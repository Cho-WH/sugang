// app.js (ES Module)

const COURSES_JSON_PATH = 'courses.json';
const MANDATORY_GROUP_NAME = "학교지정";
const LOCAL_STORAGE_KEY = 'courseSelectionsApp_Y2Y3'; // LocalStorage 키 변경

const RESPONSE_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwQPOQ2BDjJSNb3zCmzTNBwWaiYBfyEcDAyAFgx_HHTdf9YtmwtQdvope3ImaVZ62qC/exec'; 

const ART_MUSIC_COURSE_IDS = ["c19", "c20", "c40", "c41", "c55", "c56", "c82", "c83"];
const KES_MAX_COURSE_IDS = ["c34", "c57", "c58", "c59", "c60", "c84", "c85"];
const EXACT_ART_MUSIC_SELECTION = 2; 
const MAX_KES_SELECTION = 3;
// 학년별, 학기별 필요 총 학점
const REQUIRED_TOTAL_HOURS_MAP = {
    "Y2S1": 29,
    "Y2S2": 29,
    "Y3S1": 29,
    "Y3S2": 29
};

// DOM Elements (학년/학기별로 확장)
let domElements = {}; // DOM 요소를 저장할 객체

// State
let allCourses = [];
let coursesByYearSemester = { 2: { 1: [], 2: [] }, 3: { 1: [], 2: [] } };
let groupedCoursesByYearSemester = { 2: { 1: {}, 2: {} }, 3: { 1: {}, 2: {} } };
let selectedCourseIds = new Set();
let studentName = '';
let studentIdNumber = '';

/**
 * Initializes the application.
 */
async function init() {
    cacheDomElements(); // DOM 요소 캐싱 함수 호출
    loadStateFromLocalStorage();
    domElements.studentNameInput.value = studentName;
    if (domElements.studentIdInput) domElements.studentIdInput.value = studentIdNumber;

    try {
        allCourses = await fetchCourses();
        
        // 학년/학기별로 과목 분배
        allCourses.forEach(course => {
            if (!coursesByYearSemester[course.year]) {
                coursesByYearSemester[course.year] = { 1: [], 2: [] };
            }
            if (coursesByYearSemester[course.year] && coursesByYearSemester[course.year][course.semester]) {
                coursesByYearSemester[course.year][course.semester].push(course);
            } else {
                console.warn(`Course ${course.id} has invalid year/semester: Y${course.year}S${course.semester}`);
            }
        });
        
        // 각 학년/학기별로 처리 및 렌더링
        for (const year of [2, 3]) {
            for (const semester of [1, 2]) {
                processAndGroupCourses(year, semester);
                renderCourseGroups(year, semester);
                // HTML에 required hours 업데이트
                const reqHoursSpan = document.getElementById(`required-hours-y${year}s${semester}`);
                if (reqHoursSpan) {
                    reqHoursSpan.textContent = REQUIRED_TOTAL_HOURS_MAP[`Y${year}S${semester}`];
                }
            }
        }
        
        setupEventListeners();
        updateValidationAndUI(); // 초기 UI 업데이트
    } catch (error) {
        console.error("Error initializing app:", error);
        // 각 학기 컨테이너에 오류 메시지 표시 (필요시 확장)
        const years = [2,3];
        years.forEach(year => {
            [1,2].forEach(semester => {
                const containerId = `course-list-container-y${year}s${semester}`;
                const container = document.getElementById(containerId);
                if (container) {
                    container.innerHTML = `<p style="color: red;">${year}학년 ${semester}학기 과목 정보를 불러오는데 실패했습니다.</p>`;
                }
            });
        });
    }
}

/**
 * Caches all relevant DOM elements.
 */
function cacheDomElements() {
    domElements.studentNameInput = document.getElementById('studentName');
    domElements.studentIdInput = document.getElementById('studentId');
    domElements.downloadPdfBtn = document.getElementById('download-pdf-btn');
    domElements.overallValidationMessagesContainer = document.getElementById('overall-validation-messages-container');

    for (const year of [2, 3]) {
        for (const semester of [1, 2]) {
            const keyPrefix = `y${year}s${semester}`; // e.g., y2s1
            domElements[`courseListContainer_${keyPrefix}`] = document.getElementById(`course-list-container-${keyPrefix}`);
            domElements[`totalHoursDisplay_${keyPrefix}`] = document.getElementById(`total-hours-display-${keyPrefix}`);
            domElements[`validationMessagesContainer_${keyPrefix}`] = document.getElementById(`validation-messages-container-${keyPrefix}`);
        }
    }
}

async function fetchCourses() {
    // ... (기존과 동일)
    const response = await fetch(COURSES_JSON_PATH);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} while fetching ${COURSES_JSON_PATH}`);
    }
    return await response.json();
}

/**
 * Processes courses for a specific year and semester.
 * @param {number} year - The year (2 or 3).
 * @param {number} semester - The semester (1 or 2).
 */
function processAndGroupCourses(year, semester) {
    const yearSemesterCourses = coursesByYearSemester[year][semester];
    if (!groupedCoursesByYearSemester[year]) groupedCoursesByYearSemester[year] = {};
    groupedCoursesByYearSemester[year][semester] = {}; // Reset for the year/semester
    
    const isRestoringSelection = localStorage.getItem(LOCAL_STORAGE_KEY) !== null && JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)).selectedCourseIds.length > 0;

    yearSemesterCourses.forEach(course => {
        if (!groupedCoursesByYearSemester[year][semester][course.group]) {
            const isMandatoryGroup = course.group === MANDATORY_GROUP_NAME;
            groupedCoursesByYearSemester[year][semester][course.group] = {
                courses: [],
                quota: isMandatoryGroup ? 0 : course.groupQuota,
                isMandatory: isMandatoryGroup,
            };
        }
        groupedCoursesByYearSemester[year][semester][course.group].courses.push(course);

        if (course.mandatory && !isRestoringSelection) {
            selectedCourseIds.add(course.id);
        }
    });
}

/**
 * Renders course groups for a specific year and semester.
 * @param {number} year - The year (2 or 3).
 * @param {number} semester - The semester (1 or 2).
 */
function renderCourseGroups(year, semester) {
    const keyPrefix = `y${year}s${semester}`;
    const container = domElements[`courseListContainer_${keyPrefix}`];
    if (!container) {
        console.error(`Container for year ${year} semester ${semester} not found.`);
        return;
    }
    container.innerHTML = ''; 

    const currentGroupedCourses = groupedCoursesByYearSemester[year][semester];
    
    // ... (정렬 로직은 기존과 유사하게, currentGroupedCourses를 사용)
    const sortedGroupNames = Object.keys(currentGroupedCourses).sort((a, b) => {
        // ... (기존 정렬 로직과 동일)
        const groupAData = currentGroupedCourses[a];
        const groupBData = currentGroupedCourses[b];
        if (groupAData.isMandatory && !groupBData.isMandatory) return -1;
        if (!groupAData.isMandatory && groupBData.isMandatory) return 1;
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });


    sortedGroupNames.forEach(groupName => {
        const groupData = currentGroupedCourses[groupName];
        const fieldset = document.createElement('fieldset');
        fieldset.classList.add('course-group');

        const legend = document.createElement('legend');
        let legendText = groupName;
        if (!groupData.isMandatory && groupData.quota > 0) {
            legendText += ` ( ${groupData.quota}개 선택 )`;
        }
        legend.textContent = legendText;
        fieldset.appendChild(legend);
        
        const sortedCoursesInGroup = [...groupData.courses].sort((a, b) => a.name.localeCompare(b.name));

        sortedCoursesInGroup.forEach(course => {
            // createCourseItemElement에 year, semester 전달
            const courseItem = createCourseItemElement(course, groupName, year, semester);
            fieldset.appendChild(courseItem);
        });
        container.appendChild(fieldset);
    });
}

/**
 * Creates a DOM element for a single course.
 * @param {Object} course - The course object.
 * @param {string} groupName - The name of the group the course belongs to.
 * @param {number} year - The year the course belongs to.
 * @param {number} semester - The semester the course belongs to.
 * @returns {HTMLElement} The div element representing the course item.
 */
function createCourseItemElement(course, groupName, year, semester) { // year, semester 추가
    const div = document.createElement('div');
    div.classList.add('course-item');
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `course-${course.id}`; // ID는 고유해야 하므로 course.id 사용
    checkbox.value = course.id;
    checkbox.dataset.hours = course.hours;
    checkbox.dataset.group = groupName;
    checkbox.dataset.year = year; // 데이터셋에 year 추가
    checkbox.dataset.semester = semester; // 데이터셋에 semester 추가

    if (selectedCourseIds.has(course.id)) {
        checkbox.checked = true;
    }
    if (course.mandatory) {
        checkbox.disabled = true;
    }

    checkbox.addEventListener('change', handleCourseSelectionChange);
    
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(` ${course.name} (${course.hours}학점)`));
    div.appendChild(label);
    return div;
}

function setupEventListeners() {
    domElements.downloadPdfBtn.addEventListener('click', async () => {
        if (domElements.downloadPdfBtn.disabled) return; // 버튼 비활성화 시 동작 방지
        // 1) PDF 다운로드
        await handlePdfDownload();
        // 2) 시트에 학생 응답 전송 (에러 발생해도 PDF 다운로드는 완료된 상태)
        try {
            await sendResponseToSheet();

        } catch (error) {
            console.error("Error during sendResponseToSheet after PDF download:", error);
            alert("PDF는 다운로드되었으나, 응답 제출 중 오류가 발생했습니다. 관리자에게 문의하거나 다시 시도해주세요.");
        }
    });
    domElements.studentNameInput.addEventListener('input', handleStudentNameChange);
    if (domElements.studentIdInput) {
        domElements.studentIdInput.addEventListener('input', handleStudentIdChange);
    }
}



function handleCourseSelectionChange(event) {
    // ... (기존과 동일, selectedCourseIds 업데이트 후 updateValidationAndUI 호출)
    const checkbox = event.target;
    const courseId = checkbox.value;
    
    if (checkbox.checked) {
        selectedCourseIds.add(courseId);
    } else {
        selectedCourseIds.delete(courseId);
    }
    updateValidationAndUI();
    saveStateToLocalStorage();
}

function handleStudentNameChange(event) {
    // ... (기존과 동일)
    studentName = event.target.value.trim();
    saveStateToLocalStorage();
    updateValidationAndUI(); 
}

function handleStudentIdChange(event) { // 새 함수 추가
    studentIdNumber = event.target.value.trim();
    saveStateToLocalStorage();
    updateValidationAndUI();
}

/**
 * Updates validation status and refreshes the UI for all year/semesters.
 */
function updateValidationAndUI() {
    const validationResults = {};
    let allSemestersValid = true;

    for (const year of [2, 3]) {
        for (const semester of [1, 2]) {
            const result = validateSelectionsForYearSemester(year, semester);
            validationResults[`Y${year}S${semester}`] = result;
            if (!result.isValid) {
                allSemestersValid = false;
            }

            // Update UI for Year/Semester (기존과 동일)
            const keyPrefix = `y${year}s${semester}`;
            const totalHoursDisplay = domElements[`totalHoursDisplay_${keyPrefix}`];
            const validationMessagesContainer = domElements[`validationMessagesContainer_${keyPrefix}`];

            if (totalHoursDisplay) totalHoursDisplay.textContent = result.currentTotalHours;
            if (validationMessagesContainer) {
                validationMessagesContainer.innerHTML = '';
                result.messages.forEach(msg => {
                    const p = document.createElement('p');
                    p.textContent = msg.text;
                    p.classList.add(msg.type === 'error' ? 'validation-error' : 'validation-success');
                    validationMessagesContainer.appendChild(p);
                });
            }
        }
    }

    // --- 중복 과목 검사 로직 (기존 로직 유지) ---
    let duplicateCourseError = null;
    // ... (중복 과목 검사 로직은 변경 없음) ...
    const selectedCoursesDetails = Array.from(selectedCourseIds)
        .map(id => allCourses.find(course => course.id === id))
        .filter(course => course);

    const courseNameSemesterMap = new Map();
    for (const course of selectedCoursesDetails) {
        if (!courseNameSemesterMap.has(course.name)) {
            courseNameSemesterMap.set(course.name, new Set());
        }
        courseNameSemesterMap.get(course.name).add(course.semester);
    }

    for (const [courseName, semestersSet] of courseNameSemesterMap) {
        if (semestersSet.size > 1) {
            const selectedOfferings = selectedCoursesDetails
                .filter(c => c.name === courseName)
                .map(c => `${c.year}학년 ${c.semester}학기`)
                .join(', ');
            duplicateCourseError = `과목 "${courseName}"은(는) 여러 학기에 중복하여 선택할 수 없습니다. (선택된 시점: ${selectedOfferings})`;
            break;
        }
    }


    // --- 추가 전체 검증 조건 (미술/음악, 국영수) ---
    let artMusicSelectionValid = true;
    let artMusicMessage = "";
    // ... (artMusicSelectionValid 로직은 변경 없음) ...
    const selectedArtMusicCoursesCount = Array.from(selectedCourseIds).filter(id => ART_MUSIC_COURSE_IDS.includes(id)).length;
    if (selectedArtMusicCoursesCount !== EXACT_ART_MUSIC_SELECTION) {
        artMusicSelectionValid = false;
        artMusicMessage = `미술/음악 관련 과목(${ART_MUSIC_COURSE_IDS.map(id => allCourses.find(c=>c.id===id)?.name || id).join(', ')}) 중 정확히 ${EXACT_ART_MUSIC_SELECTION}개를 선택해야 합니다. (현재 ${selectedArtMusicCoursesCount}개 선택)`;
    }


    let kesSelectionValid = true;
    let kesMessage = "";
    // ... (kesSelectionValid 로직은 변경 없음) ...
    const selectedKESCourses = Array.from(selectedCourseIds).filter(id => KES_MAX_COURSE_IDS.includes(id)).length;
    if (selectedKESCourses > MAX_KES_SELECTION) {
        kesSelectionValid = false;
        kesMessage = `지정된 국영수 관련 과목(${KES_MAX_COURSE_IDS.map(id => allCourses.find(c=>c.id===id)?.name || id).join(', ')}) 중 ${MAX_KES_SELECTION}개 이하로 선택해야 합니다. (현재 ${selectedKESCourses}개 선택)`;
    }


    // --- 학생 정보 입력 유효성 검사 ---
    let studentInfoValid = true;
    let studentInfoMessage = "";
    if (!studentName.trim()) {
        studentInfoValid = false;
        studentInfoMessage = "학생 이름을 입력해주세요.";
    } else if (domElements.studentIdInput && !studentIdNumber.trim()) { // 학번 입력 필드가 있다면 학번도 검사
        studentInfoValid = false;
        studentInfoMessage = "학번을 입력해주세요.";
    }

    // --- 선택된 과목 유무 검사 ---
    let hasSelectedCourses = selectedCourseIds.size > 0;
    let noSelectedCoursesMessage = "";
    if (!hasSelectedCourses && studentInfoValid) { // 학생 정보는 입력했는데 과목 선택이 없다면 메시지 표시
        noSelectedCoursesMessage = "선택된 과목이 없습니다. 과목을 선택해주세요.";
    }


    // Overall validation and PDF button
    const allCourseConditionsMet = allSemestersValid && !duplicateCourseError && artMusicSelectionValid && kesSelectionValid;
    const canSubmit = studentInfoValid && hasSelectedCourses && allCourseConditionsMet;

    if (domElements.downloadPdfBtn) {
        domElements.downloadPdfBtn.disabled = !canSubmit;
    }

    if (domElements.overallValidationMessagesContainer) {
        domElements.overallValidationMessagesContainer.innerHTML = '';

        // 학생 정보 유효성 메시지
        if (!studentInfoValid && studentInfoMessage) {
            const p = document.createElement('p');
            p.textContent = studentInfoMessage;
            p.classList.add('validation-error');
            domElements.overallValidationMessagesContainer.appendChild(p);
        }

        // 선택된 과목 없음 메시지
        if (studentInfoValid && !hasSelectedCourses && noSelectedCoursesMessage) {
            const p = document.createElement('p');
            p.textContent = noSelectedCoursesMessage;
            p.classList.add('validation-error'); // 또는 'validation-warning' 등
            domElements.overallValidationMessagesContainer.appendChild(p);
        }

        // 중복 과목 에러 메시지
        if (duplicateCourseError) {
            const p = document.createElement('p');
            p.textContent = duplicateCourseError;
            p.classList.add('validation-error');
            domElements.overallValidationMessagesContainer.appendChild(p);
        }

        // 미술/음악 선택 조건 메시지
        if (!artMusicSelectionValid) {
            const p = document.createElement('p');
            p.textContent = artMusicMessage;
            p.classList.add('validation-error');
            domElements.overallValidationMessagesContainer.appendChild(p);
        } else if (artMusicMessage === "" && selectedArtMusicCoursesCount === EXACT_ART_MUSIC_SELECTION && hasSelectedCourses) {
            const p = document.createElement('p');
            p.textContent = `미술/음악 관련 과목 선택 조건 충족! (정확히 ${EXACT_ART_MUSIC_SELECTION}개 선택됨)`;
            p.classList.add('validation-success');
            domElements.overallValidationMessagesContainer.appendChild(p);
        }

        // 국영수 선택 조건 메시지
        if (!kesSelectionValid) {
            const p = document.createElement('p');
            p.textContent = kesMessage;
            p.classList.add('validation-error');
            domElements.overallValidationMessagesContainer.appendChild(p);
        } else if (kesMessage === "" && hasSelectedCourses) {
            const p = document.createElement('p');
            p.textContent = `지정 국영수 관련 과목 선택 조건 충족! (최대 ${MAX_KES_SELECTION}개, 현재 ${selectedKESCourses}개)`;
            p.classList.add('validation-success');
            domElements.overallValidationMessagesContainer.appendChild(p);
        }

        // 학기별 조건 미충족 메시지 (개별 학기에서 이미 처리하지만, 요약으로도 표시 가능)
        if (!allSemestersValid && !duplicateCourseError) { // 중복 오류가 아닐 때만 표시
            const p = document.createElement('p');
            let specificIssues = [];
            if (!validationResults.Y2S1.isValid) specificIssues.push("2학년 1학기");
            if (!validationResults.Y2S2.isValid) specificIssues.push("2학년 2학기");
            if (!validationResults.Y3S1.isValid) specificIssues.push("3학년 1학기");
            if (!validationResults.Y3S2.isValid) specificIssues.push("3학년 2학기");

            if (specificIssues.length > 0) {
                p.textContent = `${specificIssues.join(', ')} 수강신청 조건이 충족되지 않았습니다. 각 학년/학기별 선택 내용을 확인해주세요.`;
                p.classList.add('validation-error');
                domElements.overallValidationMessagesContainer.appendChild(p);
            }
        }

        // 최종 제출 가능 여부 메시지
        if (canSubmit) {
            const p = document.createElement('p');
            p.textContent = "모든 수강신청 조건이 충족되었습니다. PDF 다운로드 및 제출이 가능합니다.";
            p.classList.add('validation-success');
            domElements.overallValidationMessagesContainer.appendChild(p);
        } else if (studentInfoValid && hasSelectedCourses && !allCourseConditionsMet) { // 정보 입력, 과목 선택은 했으나 다른 조건 미충족
             const p = document.createElement('p');
             p.textContent = "일부 수강신청 조건이 충족되지 않았습니다. 위의 메시지를 확인해주세요.";
             p.classList.add('validation-error');
             domElements.overallValidationMessagesContainer.appendChild(p);
        }
    }
}

/**
 * Validates current selections for a specific year and semester.
 * @param {number} year - The year (2 or 3).
 * @param {number} semester - The semester (1 or 2).
 * @returns {Object} An object containing { isValid: Boolean, messages: Array, currentTotalHours: Number }.
 */
function validateSelectionsForYearSemester(year, semester) {
    const messages = [];
    let yearSemesterIsValid = true;
    let currentTotalHoursInYearSemester = 0;
    const requiredHours = REQUIRED_TOTAL_HOURS_MAP[`Y${year}S${semester}`];

    const yearSemesterCourses = coursesByYearSemester[year]?.[semester];
    if (!yearSemesterCourses || yearSemesterCourses.length === 0) {
        return { isValid: true, messages: [{text: `${year}학년 ${semester}학기 과목 정보가 없습니다.`, type:'info'}], currentTotalHours: 0 };
    }
    const currentGroupedCourses = groupedCoursesByYearSemester[year]?.[semester];

    Object.entries(currentGroupedCourses).forEach(([groupName, groupData]) => {
        if (!groupData.isMandatory) {
            const selectedInGroup = groupData.courses.filter(c => selectedCourseIds.has(c.id)).length;
            if (selectedInGroup !== groupData.quota) {
                messages.push({ text: `"${groupName}" 그룹에서 ${groupData.quota}개의 과목을 선택해야 합니다. (현재 ${selectedInGroup}개 선택)`, type: 'error' });
                yearSemesterIsValid = false;
            } else {
                 messages.push({ text: `"${groupName}" 그룹 선택 완료! (${selectedInGroup}/${groupData.quota}개)`, type: 'success' });
            }
        }
    });

    yearSemesterCourses.forEach(course => {
        if (selectedCourseIds.has(course.id)) {
            currentTotalHoursInYearSemester += course.hours;
        }
    });

    if (currentTotalHoursInYearSemester !== requiredHours) {
        messages.push({ text: `${year}학년 ${semester}학기 총 학점은 정확히 ${requiredHours}학점이어야 합니다. (현재 ${currentTotalHoursInYearSemester}학점)`, type: 'error' });
        yearSemesterIsValid = false;
    } else {
        messages.push({ text: `${year}학년 ${semester}학기 총 학점 조건 충족! (${currentTotalHoursInYearSemester}/${requiredHours}학점)`, type: 'success' });
    }
    
    const yearSemesterLabel = `${year}학년 ${semester}학기`;
    if (yearSemesterIsValid) {
        messages.unshift({ text: `${yearSemesterLabel} 선택 조건이 모두 충족되었습니다.`, type: 'success' });
    } else {
        messages.unshift({ text: `${yearSemesterLabel} 일부 조건이 충족되지 않았습니다.`, type: 'error' });
    }

    return { isValid: yearSemesterIsValid, messages, currentTotalHours: currentTotalHoursInYearSemester };
}

/**
 * Handles the PDF download button click.
 * Generates and downloads a PDF of selected courses, grouped by year and semester.
 */
async function handlePdfDownload() {
    if (domElements.downloadPdfBtn.disabled) return;

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

    // --- 폰트 로드 및 등록 (기존과 동일) ---
    try {
        const fontUrl = './NanumSquare_acR.ttf';
        const response = await fetch(fontUrl);
        if (!response.ok) throw new Error(`폰트 파일 로드 실패: ${response.statusText}`);
        const fontBuffer = await response.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(fontBuffer);
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        const fontBase64 = btoa(binary);
        pdf.addFileToVFS('NanumSquare_acR.ttf', fontBase64);
        pdf.addFont('NanumSquare_acR.ttf', 'NanumSquareACR', 'normal');
        pdf.setFont('NanumSquareACR', 'normal');
        console.log("NanumSquare_acR.ttf font registered successfully.");
    } catch (error) {
        console.error("폰트 로드 및 등록 오류:", error);
        alert("PDF용 한글 글꼴 파일을 불러오는 데 실패했습니다. 기본 글꼴로 생성합니다.");
        pdf.setFont('Helvetica');
    }

    // --- PDF 레이아웃 변수 (기존과 동일) ---
    let currentY = 20;
    const pageHeight = pdf.internal.pageSize.getHeight();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const leftMargin = 15;
    const rightMargin = 15;
    const topMargin = 20; 
    const bottomMargin = 20;
    const defaultLineHeight = 7;
    const titleFontSize = 16;
    const headerFontSize = 11;
    const normalFontSize = 9;
    const tableHeaderFontSize = 9;
    const tableCellFontSize = 8;

    function addText(text, x, y, size, style = 'normal', options = {}) {
        pdf.setFontSize(size);
        pdf.text(text, x, y, options);
    }
    
    function checkNewPage(heightNeeded = defaultLineHeight) {
        if (currentY + heightNeeded > pageHeight - bottomMargin) {
            pdf.addPage();
            currentY = topMargin;
            pdf.setFont('NanumSquareACR', 'normal');
            return true; 
        }
        return false; 
    }

    // --- PDF 내용 생성 ---
    const studentNameForPdf = domElements.studentNameInput.value.trim() || "미입력";
    const studentIdForPdf = domElements.studentIdInput ? (domElements.studentIdInput.value.trim() || "미입력") : "미입력";
    
    checkNewPage(titleFontSize / 2.5 + defaultLineHeight);
    addText("수강신청 내역서", pageWidth / 2, currentY, titleFontSize, 'normal', { align: 'center' });
    currentY += titleFontSize / 2.5 + defaultLineHeight;

    checkNewPage(normalFontSize / 2.5 + defaultLineHeight);
    let studentInfoLine = `학생 이름: ${studentNameForPdf}`;
    if (studentIdForPdf !== "미입력") {
        studentInfoLine += `  (학번: ${studentIdForPdf})`;
    }
    addText(studentInfoLine, leftMargin, currentY, normalFontSize);
    currentY += defaultLineHeight * 1.5;;
    
    checkNewPage(normalFontSize / 2.5 + defaultLineHeight * 3); 
    const teacherSignX = pageWidth - rightMargin; 
    addText("담임교사 확인: _______________", teacherSignX, currentY, normalFontSize, 'normal', { align: 'right' });
    currentY += defaultLineHeight * 2; 
    
    let overallTotalHoursForPdf = 0;
    const courseNameColX = leftMargin;
    const hoursColX = pageWidth - rightMargin; 
    const tableTextYOffset = defaultLineHeight * 0.6;

    // 학년별, 학기별 과목 리스트
    for (const year of [2, 3]) {
        if (year === 3) { // 현재 처리할 학년이 3학년이면
            pdf.addPage();
            currentY = topMargin; // Y 위치 초기화
            pdf.setFont('NanumSquareACR', 'normal'); // 새 페이지에 폰트 재설정 (필요시)
        }
        for (const semester of [1, 2]) {
            const yearSemesterCoursesSelected = coursesByYearSemester[year]?.[semester]
                ?.filter(course => selectedCourseIds.has(course.id))
                .sort((a, b) => { 
                    const groupAData = groupedCoursesByYearSemester[year]?.[semester]?.[a.group];
                    const groupBData = groupedCoursesByYearSemester[year]?.[semester]?.[b.group];
                    if (groupAData && groupBData) {
                        if (groupAData.isMandatory && !groupBData.isMandatory) return -1;
                        if (!groupAData.isMandatory && groupBData.isMandatory) return 1;
                    }
                    if (a.group !== b.group) return a.group.localeCompare(b.group, undefined, { numeric: true, sensitivity: 'base' });
                    return a.name.localeCompare(b.name);
                });

            if (yearSemesterCoursesSelected && yearSemesterCoursesSelected.length > 0) {
                checkNewPage(headerFontSize / 2.5 + defaultLineHeight * 1.5); 
                
                addText(`${year}학년 ${semester}학기 선택과목`, leftMargin, currentY, headerFontSize, 'normal');
                currentY += defaultLineHeight * 1.5;

                checkNewPage(tableHeaderFontSize / 2.5 + defaultLineHeight);
                pdf.setLineWidth(0.2);
                pdf.line(leftMargin, currentY, pageWidth - rightMargin, currentY); 
                currentY += tableTextYOffset;
                addText("과목명", courseNameColX + 2, currentY, tableHeaderFontSize, 'normal');
                addText("학점", hoursColX - 2, currentY, tableHeaderFontSize, 'normal', { align: 'right' });
                currentY += defaultLineHeight - tableTextYOffset; 
                pdf.line(leftMargin, currentY, pageWidth - rightMargin, currentY); 
                currentY += 1; 

                let yearSemesterTotalHours = 0;
                for (const course of yearSemesterCoursesSelected) {
                    checkNewPage(tableCellFontSize / 2.5 + defaultLineHeight);
                    currentY += tableTextYOffset -1; 
                    addText(course.name, courseNameColX + 2, currentY, tableCellFontSize);
                    addText(course.hours.toString(), hoursColX - 2, currentY, tableCellFontSize, 'normal', { align: 'right' });
                    currentY += defaultLineHeight - (tableTextYOffset -1) ; 
                    pdf.line(leftMargin, currentY, pageWidth - rightMargin, currentY); 
                    currentY += 1; 
                    yearSemesterTotalHours += course.hours;
                }
                overallTotalHoursForPdf += yearSemesterTotalHours;

                checkNewPage(normalFontSize / 2.5 + defaultLineHeight * 1.5); 
                currentY += defaultLineHeight / 2;
                addText(`${year}학년 ${semester}학기 총 학점:`, hoursColX - 35, currentY, normalFontSize, 'normal', { align: 'right'});
                addText(yearSemesterTotalHours.toString(), hoursColX - 2, currentY, normalFontSize, 'normal', { align: 'right'});
                currentY += defaultLineHeight * 1.5; 
            }
        }
    }
    
    if (overallTotalHoursForPdf > 0) {
        checkNewPage(headerFontSize / 2.5 + defaultLineHeight);
        pdf.setLineWidth(0.5);
        pdf.line(leftMargin, currentY, pageWidth - rightMargin, currentY); 
        currentY += defaultLineHeight;

        checkNewPage(headerFontSize / 2.5 + defaultLineHeight);
        addText("전체 총 선택 학점:", hoursColX - 35, currentY, headerFontSize, 'normal', {align: 'right'});
        addText(overallTotalHoursForPdf.toString(), hoursColX -2 , currentY, headerFontSize, 'normal', {align: 'right'});
        currentY += defaultLineHeight;
    } else {
         checkNewPage(normalFontSize / 2.5 + defaultLineHeight);
         addText("선택된 과목이 없습니다.", leftMargin, currentY, normalFontSize);
         currentY += defaultLineHeight;
    }

    // --- PDF 저장 (기존과 동일) ---
    let filenamePrefix = studentNameForPdf !== "미입력" ? studentNameForPdf : "학생";
    if (studentIdForPdf !== "미입력") {
        filenamePrefix = `${studentIdForPdf}_${filenamePrefix}`;
    }
    const filename = `수강신청내역_${filenamePrefix}.pdf`;
    
    try {
        pdf.save(filename);
    } catch (e) {
        console.error("Error saving PDF:", e);
        alert("PDF를 저장하는 중 오류가 발생했습니다. 콘솔을 확인해주세요.");
    }
}

function saveStateToLocalStorage() {
    const state = {
        selectedCourseIds: Array.from(selectedCourseIds),
        studentName: studentName,
        studentIdNumber: studentIdNumber // 학번 정보 저장
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
}

function loadStateFromLocalStorage() {
    const savedState = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedState) {
        try {
            const state = JSON.parse(savedState);
            selectedCourseIds = new Set(state.selectedCourseIds || []);
            studentName = state.studentName || '';
            studentIdNumber = state.studentIdNumber || ''; // 학번 정보 로드
        } catch (e) {
            console.error("Error parsing state from localStorage:", e);
            selectedCourseIds = new Set(); 
            studentName = '';
            studentIdNumber = ''; // 초기화
        }
    }
}

// --- 응답 전송 함수 ---
async function sendResponseToSheet() {
  const payload = {
    studentName,
    studentId: studentIdNumber,
    selectedCourseIds: Array.from(selectedCourseIds),
  };

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(RESPONSE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(res.statusText);
      alert('응답이 정상적으로 제출되었습니다!');
      return;
    } catch (err) {
      // 429 또는 네트워크 에러 시 지수 백오프 + 랜덤 지터
      const backoff = (2 ** attempt) * 200 + Math.random() * 100;
      await new Promise(r => setTimeout(r, backoff));
      if (attempt === 4) {
        alert('제출에 반복 실패했습니다. 잠시 후 다시 시도해 주세요.');
        console.error('최종 오류:', err);
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', init);
