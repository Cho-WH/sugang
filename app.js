// app.js (ES Module)

const COURSES_JSON_PATH = 'courses.json';
const REQUIRED_TOTAL_HOURS_PER_SEMESTER = 29;
const MANDATORY_GROUP_NAME = "학교지정";
const LOCAL_STORAGE_KEY = 'courseSelectionsApp';

// DOM Elements
let courseListContainer1, totalHoursDisplay1, validationMessagesContainer1;
let courseListContainer2, totalHoursDisplay2, validationMessagesContainer2;
let downloadPdfBtn, studentNameInput, overallValidationMessagesContainer;

// State
let allCourses = [];
let coursesBySemester = { 1: [], 2: [] };
let groupedCoursesBySemester = { 1: {}, 2: {} };
let selectedCourseIds = new Set();
let studentName = '';

/**
 * Initializes the application.
 */
async function init() {
    // Cache DOM elements
    courseListContainer1 = document.getElementById('course-list-container-1');
    totalHoursDisplay1 = document.getElementById('total-hours-display-1');
    validationMessagesContainer1 = document.getElementById('validation-messages-container-1');
    
    courseListContainer2 = document.getElementById('course-list-container-2');
    totalHoursDisplay2 = document.getElementById('total-hours-display-2');
    validationMessagesContainer2 = document.getElementById('validation-messages-container-2');

    downloadPdfBtn = document.getElementById('download-pdf-btn');
    studentNameInput = document.getElementById('studentName');
    overallValidationMessagesContainer = document.getElementById('overall-validation-messages-container');

    loadStateFromLocalStorage();
    studentNameInput.value = studentName;

    try {
        allCourses = await fetchCourses();
        
        allCourses.forEach(course => {
            if (coursesBySemester[course.semester]) {
                coursesBySemester[course.semester].push(course);
            }
        });

        processAndGroupCourses(1);
        processAndGroupCourses(2);
        
        renderCourseGroups(1);
        renderCourseGroups(2);
        
        setupEventListeners();
        updateValidationAndUI();
    } catch (error) {
        console.error("Error initializing app:", error);
        if (courseListContainer1) courseListContainer1.innerHTML = '<p style="color: red;">1학기 과목 정보를 불러오는데 실패했습니다. 파일을 확인해주세요.</p>';
        if (courseListContainer2) courseListContainer2.innerHTML = '<p style="color: red;">2학기 과목 정보를 불러오는데 실패했습니다. 파일을 확인해주세요.</p>';
    }
}

/**
 * Fetches course data from courses.json.
 * @returns {Promise<Array>} A promise that resolves to an array of course objects.
 */
async function fetchCourses() {
    const response = await fetch(COURSES_JSON_PATH);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} while fetching ${COURSES_JSON_PATH}`);
    }
    return await response.json();
}

/**
 * Processes courses for a specific semester to group them and identify mandatory selections.
 * @param {number} semester - The semester (1 or 2).
 */
function processAndGroupCourses(semester) {
    const semesterCourses = coursesBySemester[semester];
    groupedCoursesBySemester[semester] = {}; // Reset for the semester
    
    // Determine if we are restoring selections from localStorage
    // This check is simplified: if localStorage has *any* selections, assume it's a restoration.
    // A more robust check might involve comparing localStorage content with initial mandatory courses.
    const isRestoringSelection = localStorage.getItem(LOCAL_STORAGE_KEY) !== null && JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)).selectedCourseIds.length > 0;

    semesterCourses.forEach(course => {
        if (!groupedCoursesBySemester[semester][course.group]) {
            const isMandatoryGroup = course.group === MANDATORY_GROUP_NAME;
            groupedCoursesBySemester[semester][course.group] = {
                courses: [],
                quota: isMandatoryGroup ? 0 : course.groupQuota, // Mandatory groups have no selectable quota from UI perspective
                isMandatory: isMandatoryGroup,
            };
        }
        groupedCoursesBySemester[semester][course.group].courses.push(course);

        // If not restoring from localStorage, pre-select mandatory courses for this semester
        if (course.mandatory && !isRestoringSelection) {
            selectedCourseIds.add(course.id);
        }
    });
}

/**
 * Renders course groups for a specific semester.
 * @param {number} semester - The semester (1 or 2).
 */
function renderCourseGroups(semester) {
    const container = semester === 1 ? courseListContainer1 : courseListContainer2;
    if (!container) {
        console.error(`Container for semester ${semester} not found.`);
        return;
    }
    container.innerHTML = ''; 

    const currentGroupedCourses = groupedCoursesBySemester[semester];
    
    const sortedGroupNames = Object.keys(currentGroupedCourses).sort((a, b) => {
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
            const courseItem = createCourseItemElement(course, groupName, semester);
            fieldset.appendChild(courseItem);
        });
        container.appendChild(fieldset);
    });
}

/**
 * Creates a DOM element for a single course.
 * @param {Object} course - The course object.
 * @param {string} groupName - The name of the group the course belongs to.
 * @param {number} semester - The semester the course belongs to.
 * @returns {HTMLElement} The div element representing the course item.
 */
function createCourseItemElement(course, groupName, semester) {
    const div = document.createElement('div');
    div.classList.add('course-item');
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `course-${course.id}`;
    checkbox.value = course.id;
    checkbox.dataset.hours = course.hours;
    checkbox.dataset.group = groupName;
    checkbox.dataset.semester = semester; 

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

/**
 * Sets up global event listeners.
 */
function setupEventListeners() {
    downloadPdfBtn.addEventListener('click', handlePdfDownload);
    studentNameInput.addEventListener('input', handleStudentNameChange);
}

/**
 * Handles changes in course selection checkboxes.
 * @param {Event} event - The change event object.
 */
function handleCourseSelectionChange(event) {
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

/**
 * Handles changes in the student name input field.
 */
function handleStudentNameChange(event) {
    studentName = event.target.value.trim();
    // PDF button state might depend on name if it were mandatory, but for now, just save
    saveStateToLocalStorage();
    // No need to call updateValidationAndUI() unless name affects validation rules.
    // However, if PDF filename changes, it's good practice. Let's keep it for consistency.
    updateValidationAndUI(); 
}

/**
 * Updates validation status and refreshes the UI for both semesters.
 */
function updateValidationAndUI() {
    const validationResult1 = validateSelectionsForSemester(1);
    const validationResult2 = validateSelectionsForSemester(2);

    // Update UI for Semester 1
    if (totalHoursDisplay1) totalHoursDisplay1.textContent = validationResult1.currentTotalHours;
    if (validationMessagesContainer1) {
        validationMessagesContainer1.innerHTML = '';
        validationResult1.messages.forEach(msg => {
            const p = document.createElement('p');
            p.textContent = msg.text;
            p.classList.add(msg.type === 'error' ? 'validation-error' : 'validation-success');
            validationMessagesContainer1.appendChild(p);
        });
    }

    // Update UI for Semester 2
    if (totalHoursDisplay2) totalHoursDisplay2.textContent = validationResult2.currentTotalHours;
    if (validationMessagesContainer2) {
        validationMessagesContainer2.innerHTML = '';
        validationResult2.messages.forEach(msg => {
            const p = document.createElement('p');
            p.textContent = msg.text;
            p.classList.add(msg.type === 'error' ? 'validation-error' : 'validation-success');
            validationMessagesContainer2.appendChild(p);
        });
    }
    
    // --- 중복 과목 검사 로직 ---
    let duplicateCourseError = null;
    const selectedCoursesDetails = Array.from(selectedCourseIds)
        .map(id => allCourses.find(course => course.id === id))
        .filter(course => course); // null 값 제거 (혹시 모를 경우 대비)

    const courseNameSemesterMap = new Map();
    for (const course of selectedCoursesDetails) {
        if (!courseNameSemesterMap.has(course.name)) {
            courseNameSemesterMap.set(course.name, new Set());
        }
        courseNameSemesterMap.get(course.name).add(course.semester);
    }

    for (const [courseName, semesters] of courseNameSemesterMap) {
        if (semesters.size > 1) { // 같은 과목명으로 여러 학기에 선택됨
            duplicateCourseError = `과목 "${courseName}"은(는) 여러 학기에 중복하여 선택할 수 없습니다.`;
            break; // 첫 번째 중복 발견 시 중단
        }
    }

    // Overall validation and PDF button
    const overallIsValid = validationResult1.isValid && validationResult2.isValid && !duplicateCourseError; // 중복 에러 없을 때만 유효
    if (downloadPdfBtn) downloadPdfBtn.disabled = !overallIsValid;
    
    if (overallValidationMessagesContainer) {
        overallValidationMessagesContainer.innerHTML = ''; // Clear previous overall messages

        if (duplicateCourseError) { // 중복 에러가 있으면 최우선으로 표시
            const p = document.createElement('p');
            p.textContent = duplicateCourseError;
            p.classList.add('validation-error');
            overallValidationMessagesContainer.appendChild(p);
        }

        if (overallIsValid) {
            const p = document.createElement('p');
            p.textContent = "모든 학기의 수강신청 조건이 충족되었습니다. PDF 다운로드가 가능합니다.";
            p.classList.add('validation-success');
            overallValidationMessagesContainer.appendChild(p);
        } else if (!duplicateCourseError) { // 중복 에러가 없고, 다른 이유로 유효하지 않을 때
            const p = document.createElement('p');
            let specificIssues = [];
            if (!validationResult1.isValid) specificIssues.push("1학기");
            if (!validationResult2.isValid) specificIssues.push("2학기");
            
            p.textContent = `${specificIssues.join(', ')} 수강신청 조건이 충족되지 않았습니다. 각 학기별 선택 내용을 확인해주세요.`;
            p.classList.add('validation-error');
            overallValidationMessagesContainer.appendChild(p);
        }
        // 만약 duplicateCourseError가 있고, 다른 학기별 오류도 있다면,
        // 중복 에러 메시지 외에 학기별 오류 메시지는 각 학기 섹션에 이미 표시되므로
        // overallValidationMessagesContainer에는 중복 에러만 표시하거나,
        // "그리고 일부 학기 조건도 미충족..." 같은 메시지를 추가할 수 있습니다.
        // 현재는 중복 에러가 있으면 그것만 overall에 표시하고, PDF 버튼은 비활성화됩니다.
    }
}

/**
 * Validates current selections for a specific semester.
 * @param {number} semester - The semester (1 or 2).
 * @returns {Object} An object containing { isValid: Boolean, messages: Array, currentTotalHours: Number }.
 */
function validateSelectionsForSemester(semester) {
    const messages = [];
    let semesterIsValid = true;
    let currentTotalHoursInSemester = 0;

    const semesterCourses = coursesBySemester[semester];
    if (!semesterCourses || semesterCourses.length === 0) { // Handle case where semester data might not be loaded
        return { isValid: true, messages: [{text: `${semester}학기 과목 정보가 없습니다.`, type:'info'}], currentTotalHours: 0 };
    }
    const currentGroupedCourses = groupedCoursesBySemester[semester];

    Object.entries(currentGroupedCourses).forEach(([groupName, groupData]) => {
        if (!groupData.isMandatory) {
            const selectedInGroup = groupData.courses.filter(c => selectedCourseIds.has(c.id)).length;
            if (selectedInGroup !== groupData.quota) {
                messages.push({ text: `"${groupName}" 그룹에서 ${groupData.quota}개의 과목을 선택해야 합니다. (현재 ${selectedInGroup}개 선택)`, type: 'error' });
                semesterIsValid = false;
            } else {
                 messages.push({ text: `"${groupName}" 그룹 선택 완료! (${selectedInGroup}/${groupData.quota}개)`, type: 'success' });
            }
        }
    });

    semesterCourses.forEach(course => {
        if (selectedCourseIds.has(course.id)) {
            currentTotalHoursInSemester += course.hours;
        }
    });

    if (currentTotalHoursInSemester !== REQUIRED_TOTAL_HOURS_PER_SEMESTER) {
        messages.push({ text: `${semester}학기 총 학점은 정확히 ${REQUIRED_TOTAL_HOURS_PER_SEMESTER}학점이어야 합니다. (현재 ${currentTotalHoursInSemester}학점)`, type: 'error' });
        semesterIsValid = false;
    } else {
        messages.push({ text: `${semester}학기 총 학점 조건 충족! (${currentTotalHoursInSemester}/${REQUIRED_TOTAL_HOURS_PER_SEMESTER}학점)`, type: 'success' });
    }
    
    if (semesterIsValid) {
        messages.unshift({ text: `${semester}학기 선택 조건이 모두 충족되었습니다.`, type: 'success' });
    } else {
        messages.unshift({ text: `${semester}학기 일부 조건이 충족되지 않았습니다.`, type: 'error' });
    }

    return { isValid: semesterIsValid, messages, currentTotalHours: currentTotalHoursInSemester };
}

/**
 * Handles the PDF download button click.
 * Generates and downloads a PDF of selected courses, grouped by semester, using text and tables.
 * Loads a local lightweight Korean font (NanumSquare_acR.ttf).
 */
async function handlePdfDownload() {
    if (downloadPdfBtn.disabled) return;

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

    // --- 폰트 파일 로드 및 등록 ---
    try {
        // 폰트 파일 경로 (app.js 기준 상대 경로)
        // 만약 fonts 폴더 안에 있다면 './fonts/NanumSquare_acR.ttf' 와 같이 수정
        const fontUrl = './NanumSquare_acR.ttf';
        
        const response = await fetch(fontUrl);
        if (!response.ok) {
            throw new Error(`폰트 파일 로드 실패: ${response.statusText} (경로: ${fontUrl})`);
        }
        const fontBuffer = await response.arrayBuffer(); // ArrayBuffer로 가져옴
        
        // ArrayBuffer를 Base64 문자열로 변환
        let binary = '';
        const bytes = new Uint8Array(fontBuffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const fontBase64 = btoa(binary);

        // jsPDF에 폰트 등록
        // 1. VFS(Virtual File System)에 폰트 파일 추가
        pdf.addFileToVFS('NanumSquare_acR.ttf', fontBase64);
        // 2. 폰트 추가 (VFS에 있는 파일명, 폰트 이름, 스타일)
        pdf.addFont('NanumSquare_acR.ttf', 'NanumSquareACR', 'normal');
        // 필요하다면 bold 스타일도 동일 폰트 파일로 등록하거나, 별도의 bold 폰트 파일 사용
        // pdf.addFont('NanumSquare_acB.ttf', 'NanumSquareACR', 'bold'); // 예시 (볼드 폰트 파일이 있다면)

        // 사용할 폰트 설정
        pdf.setFont('NanumSquareACR', 'normal'); // 폰트 이름과 스타일 지정
        console.log("NanumSquare_acR.ttf font registered successfully.");

    } catch (error) {
        console.error("폰트 로드 및 등록 오류:", error);
        alert("PDF용 한글 글꼴 파일을 불러오는 데 실패했습니다. PDF에 글자가 제대로 표시되지 않을 수 있습니다. 'NanumSquare_acR.ttf' 파일이 올바른 위치에 있는지 확인해주세요. 기본 글꼴로 생성합니다.");
        pdf.setFont('Helvetica'); // 폴백 폰트 (한글 깨짐)
    }

    // --- PDF 레이아웃 변수 (이전 텍스트 기반 PDF 생성 코드와 유사하게 설정) ---
    let currentY = 20; // 현재 Y 위치 (상단 마진 포함)
    const pageHeight = pdf.internal.pageSize.getHeight();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const leftMargin = 15;
    const rightMargin = 15;
    const topMargin = 20; 
    const bottomMargin = 20;
    const defaultLineHeight = 7; // 기본 줄 간격 (mm) - 폰트 크기에 따라 조절

    const titleFontSize = 16; // 폰트에 맞춰 크기 조절 가능
    const headerFontSize = 11;
    const normalFontSize = 9;
    const tableHeaderFontSize = 9;
    const tableCellFontSize = 8;

    // 텍스트 추가 및 페이지 관리 헬퍼 함수
    function addText(text, x, y, size, style = 'normal', options = {}) {
        // pdf.setFont()는 이미 위에서 NanumSquareACR로 설정됨
        // 스타일 변경이 필요하면 pdf.setFont(undefined, style) 또는 pdf.setFont('NanumSquareACR', style) 호출
        pdf.setFontSize(size);
        // pdf.setFont('NanumSquareACR', style); // 매번 호출할 수도 있음
        pdf.text(text, x, y, options);
    }
    
    function checkNewPage(heightNeeded = defaultLineHeight) {
        if (currentY + heightNeeded > pageHeight - bottomMargin) {
            pdf.addPage();
            currentY = topMargin;
            // 새 페이지에도 폰트가 적용되도록 (보통은 세션 전반에 걸쳐 유지됨)
            pdf.setFont('NanumSquareACR', 'normal'); // 필요시 재설정
            return true; 
        }
        return false; 
    }

    // --- PDF 내용 생성 ---
    const studentNameForPdf = studentNameInput.value.trim() || "미입력";

    // 1. 문서 제목
    checkNewPage(titleFontSize / 2.5 + defaultLineHeight); // 폰트 크기에 따른 높이 근사치
    addText("수강신청 내역서", pageWidth / 2, currentY, titleFontSize, 'normal', { align: 'center' });
    currentY += titleFontSize / 2.5 + defaultLineHeight;

    // 2. 학생 이름
    checkNewPage(normalFontSize / 2.5 + defaultLineHeight);
    addText(`학생 이름: ${studentNameForPdf}`, leftMargin, currentY, normalFontSize);
    currentY += defaultLineHeight * 1.5;

    let overallTotalHoursForPdf = 0;

    // 테이블 컬럼 위치 및 너비
    const courseNameColX = leftMargin;
    const hoursColX = pageWidth - rightMargin; 
    const tableTextYOffset = defaultLineHeight * 0.6; // 선과 텍스트 간격 (폰트 크기에 맞게 조절)

    // 3. 학기별 과목 리스트
    for (const semester of [1, 2]) {
        const semesterCoursesSelected = coursesBySemester[semester]
            .filter(course => selectedCourseIds.has(course.id))
            .sort((a, b) => { 
                const groupAData = groupedCoursesBySemester[semester][a.group];
                const groupBData = groupedCoursesBySemester[semester][b.group];
                if (groupAData && groupBData) {
                    if (groupAData.isMandatory && !groupBData.isMandatory) return -1;
                    if (!groupAData.isMandatory && groupBData.isMandatory) return 1;
                }
                if (a.group !== b.group) return a.group.localeCompare(b.group, undefined, { numeric: true, sensitivity: 'base' });
                return a.name.localeCompare(b.name);
            });

        if (semesterCoursesSelected.length > 0) {
            checkNewPage(headerFontSize / 2.5 + defaultLineHeight * 1.5); 
            
            addText(`${semester}학기 선택과목`, leftMargin, currentY, headerFontSize, 'normal'); // bold 스타일 사용 가능하면 'bold'
            currentY += defaultLineHeight * 1.5;

            checkNewPage(tableHeaderFontSize / 2.5 + defaultLineHeight);
            pdf.setLineWidth(0.2);
            pdf.line(leftMargin, currentY, pageWidth - rightMargin, currentY); 
            currentY += tableTextYOffset;
            addText("과목명", courseNameColX + 2, currentY, tableHeaderFontSize, 'normal'); // bold 스타일 사용 가능하면 'bold'
            addText("학점", hoursColX - 2, currentY, tableHeaderFontSize, 'normal', { align: 'right' }); // bold 스타일 사용 가능하면 'bold'
            currentY += defaultLineHeight - tableTextYOffset; 
            pdf.line(leftMargin, currentY, pageWidth - rightMargin, currentY); 
            currentY += 1; 

            let semesterTotalHours = 0;
            for (const course of semesterCoursesSelected) {
                checkNewPage(tableCellFontSize / 2.5 + defaultLineHeight);
                
                currentY += tableTextYOffset -1; 
                addText(course.name, courseNameColX + 2, currentY, tableCellFontSize);
                addText(course.hours.toString(), hoursColX - 2, currentY, tableCellFontSize, 'normal', { align: 'right' });
                currentY += defaultLineHeight - (tableTextYOffset -1) ; 
                pdf.line(leftMargin, currentY, pageWidth - rightMargin, currentY); 
                currentY += 1; 

                semesterTotalHours += course.hours;
            }
            overallTotalHoursForPdf += semesterTotalHours;

            checkNewPage(normalFontSize / 2.5 + defaultLineHeight * 1.5); 
            currentY += defaultLineHeight / 2;
            addText(`${semester}학기 총 학점:`, hoursColX - 25, currentY, normalFontSize, 'normal', { align: 'right'}); // bold 스타일 사용 가능하면 'bold'
            addText(semesterTotalHours.toString(), hoursColX - 2, currentY, normalFontSize, 'normal', { align: 'right'}); // bold 스타일 사용 가능하면 'bold'
            currentY += defaultLineHeight * 1.5; 
        }
    }
    
    if (overallTotalHoursForPdf > 0) {
        checkNewPage(headerFontSize / 2.5 + defaultLineHeight);
        pdf.setLineWidth(0.5);
        pdf.line(leftMargin, currentY, pageWidth - rightMargin, currentY); 
        currentY += defaultLineHeight;

        checkNewPage(headerFontSize / 2.5 + defaultLineHeight);
        addText("전체 총 선택 학점:", hoursColX - 35, currentY, headerFontSize, 'normal', {align: 'right'}); // bold 스타일 사용 가능하면 'bold'
        addText(overallTotalHoursForPdf.toString(), hoursColX -2 , currentY, headerFontSize, 'normal', {align: 'right'}); // bold 스타일 사용 가능하면 'bold'
        currentY += defaultLineHeight;
    } else {
         checkNewPage(normalFontSize / 2.5 + defaultLineHeight);
         addText("선택된 과목이 없습니다.", leftMargin, currentY, normalFontSize);
         currentY += defaultLineHeight;
    }

    // --- PDF 저장 ---
    const filename = studentNameForPdf !== "미입력" ? `수강신청내역_${studentNameForPdf}.pdf` : '수강신청내역.pdf';
    try {
        pdf.save(filename);
    } catch (e) {
        console.error("Error saving PDF:", e);
        alert("PDF를 저장하는 중 오류가 발생했습니다. 콘솔을 확인해주세요.");
    }
}

/**
 * Saves the current state (selected courses, student name) to localStorage.
 */
function saveStateToLocalStorage() {
    const state = {
        selectedCourseIds: Array.from(selectedCourseIds),
        studentName: studentName
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
}

/**
 * Loads state from localStorage and applies it.
 */
function loadStateFromLocalStorage() {
    const savedState = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedState) {
        try {
            const state = JSON.parse(savedState);
            selectedCourseIds = new Set(state.selectedCourseIds || []);
            studentName = state.studentName || '';
        } catch (e) {
            console.error("Error parsing state from localStorage:", e);
            selectedCourseIds = new Set(); // Reset to default if parsing fails
            studentName = '';
        }
    }
}

document.addEventListener('DOMContentLoaded', init);