

export type Language = 'en' | 'ua';

export const translations = {
  en: {
    // Sidebar
    dashboard: "Dashboard",
    facultyList: "Faculty List",
    searchMenu: "Search ORCID",
    aiAssistant: "AI Assistant",
    reports: "Reports",
    mvpVersion: "Pro Version",
    localData: "ORCID + OpenAlex",
    appName: "Research Tracker",

    // Header
    systemName: "Research Management System",
    addFaculty: "Add Faculty",
    settings: "API Settings",

    // Dashboard
    totalFaculty: "Total Faculty",
    totalPubs: "Total Publications",
    pubsThisYear: "Pubs (Current Year)",
    collaborations: "Est. Collaborations",
    pubTrends: "Publication Trends",
    pubTypes: "Publication Types",
    topFaculty: "Top Productive Faculty",
    totalCitations: "Total Citations",
    avgHIndex: "Avg. H-index",
    hIndexDist: "H-index Distribution",
    citationHistory: "Citation History (Combined)",
    filterByDept: "Filter by Department",
    filterByFaculty: "Filter by Faculty",
    filterByYear: "Filter by Year",
    fromYear: "From",
    toYear: "To",
    allDepartments: "All Departments",
    allFaculty: "All Faculty",
    scopusPubs: "Indexed in Scopus",
    wosPubs: "Indexed in WoS",
    
    // Faculty List
    name: "Name",
    department: "Department",
    position: "Position",
    publications: "Publications",
    lastYear: "Last Year",
    actions: "Actions",
    noFaculty: "No faculty members tracked",
    addFacultyPrompt: "Add a faculty member using their ORCID ID to get started.",
    hIndex: "H-index",
    citations: "Citations",
    sources: "Sources",

    // Profile Modal
    researchTopics: "Research Topics",
    institutions: "Affiliations",
    topWorks: "Top Cited Works",
    openAccess: "Open Access",
    mergedFrom: "Data merged from:",

    // Publication Details
    pubDetails: "Publication Details",
    authors: "Authors",
    abstract: "Abstract",
    noAbstract: "No abstract available for this record.",
    viewOriginal: "View Original Source",
    journal: "Journal/Conference",
    pubYear: "Year",
    pubType: "Type",
    close: "Close",

    // Chat
    chatHeader: "Research Intelligence Assistant",
    welcomeMessage: "Hello! I am your AI research assistant. I have access to your current faculty data including OpenAlex metrics (H-index, Citations) and research topics. Ask me about publication trends, identify gaps, or request summaries.",
    welcomeMessageUA: "Привіт! Я ваш AI-асистент з досліджень. Я маю доступ до даних викладачів та метрик OpenAlex. Запитайте мене про тренди публікацій або попросіть створити звіт.",
    inputPlaceholder: "Ask about trends, specific researchers, or generate summaries...",
    send: "Send",
    hints: [
      "Find faculty with no pubs in 2024", 
      "Who has the highest H-index?", 
      "Compare department output"
    ],
    errorMsg: "Sorry, I encountered an error while processing your request.",

    // Reports
    smartReport: "Smart Report Generator",
    smartReportDesc: "Generate analysis reports or fill templates using Gemini",
    reportType: "Report Type",
    targetDept: "Target Department",
    targetFaculty: "Target Faculty",
    generateBtn: "Generate Report",
    generating: "Analyzing & Generating...",
    download: "Download Result",
    reportGenerated: "Report Generated",
    standardReports: "Standard Reports",
    customTemplates: "Custom Templates (AI)",
    uploadTemplate: "Upload Template (All Formats)",
    uploadDesc: "Upload a rating form, table, or document. Gemini will fill it with faculty data.",
    dragDrop: "Drag and drop or click to browse",
    fileParsed: "File analyzed. Ready to fill.",
    analyzingTemplate: "Analyzing template structure...",
    fillTemplate: "Fill Template with Data",
    additionalInstructions: "Additional Instructions (Optional)",
    instructionsPlaceholder: "E.g., Only count publications from 2024; Calculate score as 100 points per article...",
    visualizeReport: "Visualize Report",
    rawView: "Raw Markdown",
    supportsFiles: "Supports .docx, .xlsx, .pdf, .csv, .txt, .md",
    outputFormat: "Format",
    
    // Search
    searchPageTitle: "Search by Institution",
    searchDesc: "Find researchers by searching for their university or college name in the ORCID registry.",
    searchPlaceholder: "Enter institution (e.g., Cherkasy State Business College)",
    searchBtn: "Search",
    resultsFound: "Results found",
    noResults: "No results found. Try a different variation of the institution name.",
    addToTracker: "Add to Tracker",
    tracked: "Tracked",
    assignInfo: "Assign Local Info",
    assignInfoDesc: "Please provide the local department and position for this researcher.",
    confirmAdd: "Confirm & Add",

    // Modals & Forms
    trackNew: "Track New Researcher",
    orcidId: "ORCID ID",
    mustBePublic: "Must be public on ORCID registry.",
    fetchAdd: "Fetch & Add Faculty",
    viewProfile: "Faculty Profile",
    biography: "Biography",
    recentPubs: "Recent Publications",
    thisYear: "This Year",
    country: "Country",
    fetchingOpenAlex: "Enriching with OpenAlex metrics...",
    fetchingScopus: "Checking Scopus...",
    fetchingWos: "Checking WoS...",
    
    // Settings
    configureApis: "Configure Data Sources",
    enterKeys: "Enter API Keys to enable real-time fetching from Scopus and WoS. If left empty, the system will use simulation mode.",
    saveSettings: "Save Settings",

    // Departments & Positions (Common)
    dept: "Department",
    enterDeptPlaceholder: "Enter Department Name (Optional)",
    cs: "Computer Science",
    physics: "Physics",
    math: "Mathematics",
    bio: "Biology",
    eng: "Engineering",
    
    prof: "Professor",
    assocProf: "Associate Professor",
    assistProf: "Assistant Professor",
    lecturer: "Lecturer",
    researcher: "Researcher"
  },
  ua: {
    // Sidebar
    dashboard: "Дашборд",
    facultyList: "Список викладачів",
    searchMenu: "Пошук в ORCID",
    aiAssistant: "AI Асистент",
    reports: "Звіти",
    mvpVersion: "Pro Версія",
    localData: "ORCID + OpenAlex + Scopus",
    appName: "Науковий Трекер",

    // Header
    systemName: "Система управління наукою",
    addFaculty: "Додати викладача",
    settings: "Налаштування API",

    // Dashboard
    totalFaculty: "Всього викладачів",
    totalPubs: "Всього публікацій",
    pubsThisYear: "Публікації (Цей рік)",
    collaborations: "Співпраці (оцінка)",
    pubTrends: "Динаміка публікацій",
    pubTypes: "Типи публікацій",
    topFaculty: "Топ продуктивних викладачів",
    totalCitations: "Всього цитувань",
    avgHIndex: "Сер. H-індекс",
    hIndexDist: "Розподіл H-індексу",
    citationHistory: "Динаміка цитувань (Зведена)",
    filterByDept: "Фільтр за кафедрою",
    filterByFaculty: "Фільтр за викладачем",
    filterByYear: "Фільтр за роками",
    fromYear: "З",
    toYear: "По",
    allDepartments: "Всі кафедри",
    allFaculty: "Всі викладачі",
    scopusPubs: "Індексовано в Scopus",
    wosPubs: "Індексовано в WoS",

    // Faculty List
    name: "ПІБ",
    department: "Кафедра",
    position: "Посада",
    publications: "Публікації",
    lastYear: "Минулий рік",
    actions: "Дії",
    noFaculty: "Список викладачів порожній",
    addFacultyPrompt: "Додайте викладача за допомогою ORCID ID, щоб почати.",
    hIndex: "H-індекс",
    citations: "Цитування",
    sources: "Джерела",

    // Profile Modal
    researchTopics: "Теми досліджень",
    institutions: "Афіліації",
    topWorks: "Топ цитованих робіт",
    openAccess: "Відкритий доступ",
    mergedFrom: "Дані об'єднано з:",

    // Publication Details
    pubDetails: "Деталі публікації",
    authors: "Автори",
    abstract: "Анотація",
    noAbstract: "Анотація відсутня для цього запису.",
    viewOriginal: "Переглянути джерело",
    journal: "Журнал/Конференція",
    pubYear: "Рік",
    pubType: "Тип",
    close: "Закрити",

    // Chat
    chatHeader: "Інтелектуальний помічник",
    welcomeMessage: "Привіт! Я ваш AI-асистент. Я маю доступ до даних викладачів та метрик OpenAlex. Запитайте мене про тренди, прогалини в дослідженнях або попросіть підсумувати дані.",
    welcomeMessageUA: "Привіт! Я ваш AI-асистент. Я маю доступ до даних викладачів та метрик OpenAlex. Запитайте мене про тренди, прогалини в дослідженнях або попросіть підсумувати дані.",
    inputPlaceholder: "Запитайте про тренди або згенеруйте звіт...",
    send: "Надіслати",
    hints: [
      "Викладачі без публікацій у 2024", 
      "У кого найвищий H-індекс?", 
      "Порівняти продуктивність кафедр"
    ],
    errorMsg: "Вибачте, виникла помилка при обробці запиту.",

    // Reports
    smartReport: "Генератор звітів",
    smartReportDesc: "Створення звітів та заповнення шаблонів через Gemini",
    reportType: "Тип звіту",
    targetDept: "Кафедра",
    targetFaculty: "Викладач",
    generateBtn: "Згенерувати звіт",
    generating: "Аналіз та генерація...",
    download: "Завантажити результат",
    reportGenerated: "Звіт згенеровано",
    standardReports: "Стандартні звіти",
    customTemplates: "Власні шаблони (AI)",
    uploadTemplate: "Завантажити шаблон (Всі формати)",
    uploadDesc: "Завантажте рейтингову форму або таблицю. Gemini заповнить її даними.",
    dragDrop: "Перетягніть файл або натисніть для вибору",
    fileParsed: "Файл проаналізовано. Готовий до заповнення.",
    analyzingTemplate: "Аналіз структури шаблону...",
    fillTemplate: "Заповнити шаблон даними",
    additionalInstructions: "Додаткові інструкції (Опціонально)",
    instructionsPlaceholder: "Напр., Враховувати лише публікації за 2024 рік; Рахувати бали як 100 за статтю...",
    visualizeReport: "Візуалізація звіту",
    rawView: "Текст Markdown",
    supportsFiles: "Підтримує .docx, .xlsx, .pdf, .csv, .txt, .md",
    outputFormat: "Формат",

    // Search
    searchPageTitle: "Пошук за закладом",
    searchDesc: "Знайдіть дослідників, ввівши назву університету або коледжу в реєстрі ORCID.",
    searchPlaceholder: "Введіть заклад (напр., Черкаський державний бізнес-коледж)",
    searchBtn: "Пошук",
    resultsFound: "Знайдено результатів",
    noResults: "Нічого не знайдено. Спробуйте іншу назву закладу.",
    addToTracker: "Додати до трекера",
    tracked: "Відстежується",
    assignInfo: "Вказати локальні дані",
    assignInfoDesc: "Будь ласка, вкажіть кафедру та посаду для цього викладача.",
    confirmAdd: "Підтвердити та додати",

    // Modals & Forms
    trackNew: "Додати дослідника",
    orcidId: "ORCID ID",
    mustBePublic: "Має бути публічним у реєстрі ORCID.",
    fetchAdd: "Завантажити та додати",
    viewProfile: "Профіль викладача",
    biography: "Біографія",
    recentPubs: "Останні публікації",
    thisYear: "Цей рік",
    country: "Країна",
    fetchingOpenAlex: "Отримання метрик OpenAlex...",
    fetchingScopus: "Перевірка Scopus...",
    fetchingWos: "Перевірка Web of Science...",

    // Settings
    configureApis: "Налаштування джерел даних",
    enterKeys: "Введіть API ключі для реального доступу до Scopus та WoS. Якщо залишити пустим, система використає режим симуляції.",
    saveSettings: "Зберегти",

    // Departments & Positions
    dept: "Кафедра",
    enterDeptPlaceholder: "Введіть назву кафедри (Опціонально)",
    cs: "Інформатика",
    physics: "Фізика",
    math: "Математика",
    bio: "Біологія",
    eng: "Інженерія",
    
    prof: "Професор",
    assocProf: "Доцент",
    assistProf: "Старший викладач",
    lecturer: "Викладач",
    researcher: "Науковий співробітник"
  }
};