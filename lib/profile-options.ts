// Every validation constant and help line for the /setup profile form
// (MISSION D-UI5, CONTEXT 20:30 "Profile form"). Pure module, no imports: the
// client form, ProfileFormSchema (lib/agents/profile.ts) and the Node tests all
// read the SAME values, so the client check and the /api/profile 400 never drift.

export const GOAL_MAX = 1000;

/** Mirrors MAX_PDF_BYTES in app/api/profile/route.ts (the API refuses larger files by name). */
export const PDF_MAX_BYTES = 4 * 1024 * 1024;

export const SEASONS = ["Spring", "Summer", "Fall", "Winter"] as const;

export const WORK_AUTH = [
  {
    value: "US citizen",
    label: "US citizen (sponsorship N/A)",
    help: "Pick this if you are a US citizen: sponsorship questions are N/A for you.",
  },
  {
    value: "US permanent resident",
    label: "US permanent resident (green card)",
    help: "You can work for any employer without sponsorship.",
  },
  {
    value: "F-1 (CPT/OPT)",
    label: "F-1 student, CPT/OPT eligible",
    help: "International student on an F-1 visa: internships need CPT and work after graduation needs OPT.",
  },
  {
    value: "J-1",
    label: "J-1 exchange visitor",
    help: "Work needs academic training authorization from your program sponsor.",
  },
  {
    value: "H-4 EAD",
    label: "H-4 EAD",
    help: "Dependent of an H-1B holder with an employment authorization document.",
  },
  {
    value: "DACA",
    label: "DACA",
    help: "Deferred action with a renewable work permit.",
  },
  {
    value: "Refugee or asylee EAD",
    label: "Refugee or asylee EAD",
    help: "Employment authorization from refugee or asylum status.",
  },
  {
    value: "Other",
    label: "Other",
    help: "Any status not listed here. Roles are ranked without a sponsorship flag.",
  },
  {
    value: "Prefer not to say",
    label: "Prefer not to say",
    help: "Roles are ranked without a sponsorship flag.",
  },
] as const satisfies readonly { value: string; label: string; help: string }[];

export type WorkAuthValue = (typeof WORK_AUTH)[number]["value"];
export const WORK_AUTH_VALUES = WORK_AUTH.map((o) => o.value) as unknown as readonly [WorkAuthValue, ...WorkAuthValue[]];

// One sentence per field: what it is for and what a good answer looks like.
export const HELP = {
  resume: "One PDF, up to 4 MB. The Profile agent reads your skills and experience from it.",
  transcript: "Your unofficial transcript from Hokie SPA as a PDF, up to 4 MB. Only your courses and grades are read.",
  typedCourses: "One course per line or comma-separated, like CS 3114. Use this if you would rather not upload a transcript.",
  major: "Your primary major as the VT catalog names it. Start typing to pick from the list.",
  gradTerm: "The season and year you expect to graduate, like Spring 2028.",
  workAuthorization: "Used only to flag roles that will not sponsor, never to hide them. Pick US citizen if sponsorship is N/A for you.",
  skills: "Add skills the resume might miss. Only recognised skills are accepted; typos are corrected.",
  roleTypes: "Pick every kind of role you would take. The feed is ranked across all of them.",
  targetTerm: "The term you want the role to start, so postings for the wrong season rank lower.",
  goal: "Up to 1,000 characters. The Match agent reads this sentence first, so name the role, the industry and what you want to learn.",
  dreamTier: "Where you would most like to end up. Pick more than one if you are open.",
} as const;

export const ROLE_TYPE_HELP = HELP.roleTypes;
export const DREAM_TIER_HELP = HELP.dreamTier;

// datasets/vt_majors.csv (header major,college,degree; 213 unique majors from
// the 2026-2027 catalog, datasets lane 2026-09-19). Inlined because the CSV is
// loaded into Delta by scripts/load-datasets.mjs, not into Lakebase, so a
// per-render lookup would cost a Databricks SQL call for a static list.
export const MAJORS: readonly string[] = [
  "Agribusiness Major with Agribusiness Management Option",
  "Agribusiness Major with Veterinary Business Management Option",
  "Community Economic Development Major",
  "Environmental Economics, Management, and Policy Major",
  "Food and Health Systems Economics Major",
  "International Trade and Development Major",
  "Agricultural and Extension Education Major",
  "Community Leadership and Development Major",
  "Life Sciences Communication Major",
  "Animal and Poultry Sciences Major with Behavior and Welfare Option",
  "Animal and Poultry Sciences Major",
  "Animal and Poultry Sciences Major with Prevet Option",
  "Dairy Science Major with Dairy Business Management Option",
  "Dairy Science Major with Science/Prevet Option",
  "Dairy Science Major with Dual Emphasis Option",
  "Biochemistry Major",
  "Food Science and Technology Major with Food Business Option",
  "Food Science and Technology Major with Food and Health Option",
  "Food Science and Technology Major with Science Option",
  "Nutrition and Dietetics Major",
  "Exercise and Health Sciences Major",
  "Crop and Soil Sciences Major",
  "Ecological Restoration Major",
  "Environmental Horticulture Major",
  "Environmental Science Major",
  "Integrated Agriculture Technologies Major",
  "Landscape Design and Turfgrass Science Major",
  "Plant Science Major",
  "Consumer Studies Major",
  "Fashion Merchandising and Design Major",
  "Property Management Major",
  "Residential Environments and Design Major",
  "Architecture Major",
  "Industrial Design Major",
  "Interior Design Major",
  "Landscape Architecture Major",
  "Music Major with Composition Liberal Arts Option",
  "Music Major with Music Engineering Technology (Electrical Engineering Emphasis) Option",
  "Music Major with Music Industry Option",
  "Music Major with Music Production Option",
  "Music Major with Music Teacher Preparation Option",
  "Music Major with Performance Liberal Arts Option",
  "Music Major with Performance Professional Instrumental Option",
  "Music Major with Performance Professional Vocal Option",
  "Music Major with Technology Professional Option",
  "Art Major with Art History Option",
  "Creative Technologies Major",
  "Studio Art Major",
  "Graphic Design Major",
  "Cinema Major",
  "Theatre Arts Major with Design Option",
  "Theatre Arts Major with General Theatre Option",
  "Theatre Arts Major with Performance Option",
  "Aerospace Engineering Major",
  "Ocean Engineering Major",
  "Biological Systems Engineering Major with Biotechnology & Bioprocess Engineering Option",
  "Biological Systems Engineering Major",
  "Biological Systems Engineering Major with Ecological Engineering Option",
  "Biomedical Engineering Major",
  "Building Construction Major",
  "Chemical Engineering Major",
  "Civil Engineering Major with Environmental Engineering Option",
  "Civil Engineering Major",
  "Computer Science Major",
  "Construction Engineering and Management Major",
  "Constructioning Engineering and Management Major with Construction Safety Leadership Option",
  "Computer Engineering Major with Chip-Scale Integration Option",
  "Computer Engineering Major with Controls, Robotics & Autonomy Option",
  "Computer Engineering Major with Machine Learning Option",
  "Computer Engineering Major with Networking & Cybersecurity Option",
  "Computer Engineering Major with Software Systems Option",
  "Computer Engineering Major",
  "Electrical Engineering Major with Energy & Power Electronics Systems Option",
  "Electrical Engineering Major with Applied Electromagnetics Option",
  "Electrical Engineering Major with Controls, Robotics & Autonomy Option",
  "Electrical Engineering Major with Micro/Nano Systems Option",
  "Electrical Engineering Major with Wireless Communications and Signal Processing Option",
  "Electrical Engineering Major",
  "Industrial and Systems Engineering Major",
  "Materials Science and Engineering Major",
  "Mechanical Engineering Major",
  "Mining Engineering Major",
  "Biological Sciences Major with Bioinformatics Option",
  "Biological Sciences Major with Science Education Option",
  "Biological Sciences Major with Biomedical Option",
  "Biological Sciences Major with Ecology, Evolution, and Behavior Option",
  "Biological Sciences Major",
  "Microbiology Major with Biomedical Option",
  "Microbiology Major",
  "Chemistry Major (B.A.)",
  "Chemistry Major (B.S.)",
  "Medicinal Chemistry Major",
  "Polymer Chemistry Major",
  "Computational Modeling and Data Analytics Major with Biological Sciences Option",
  "Computational Modeling and Data Analytics Major with Cryptography and Cybersecurity Option",
  "Computational Modeling and Data Analytics Major with Economics Option",
  "Computational Modeling and Data Analytics Major with Geosciences Option",
  "Computational Modeling and Data Analytics Major with Physics Option",
  "Computational Modeling and Data Analytics Major",
  "Economics Major with Business Option",
  "Economics Major with Managerial Economics and Data Science Option",
  "Economics Major with Policy and Regulation Option",
  "Economics Major",
  "Geosciences Major with Earth Science and Society Option",
  "Geosciences Major with Environmental and Engineering Geoscience Option",
  "Geosciences Major with Geobiology & Paleobiology Option",
  "Geosciences Major with Geochemistry Option",
  "Geosciences Major with Geology Option",
  "Geosciences Major with Geophysics Option",
  "Mathematics Major with Applied Computational Mathematics Option",
  "Mathematics Major with Applied Discrete Mathematics Option",
  "Mathematics Major with Mathematics Education (Master's Track) Option",
  "Mathematics Major",
  "Nanomedicine Major",
  "Nanoscience Major",
  "Clinical Neuroscience Major",
  "Cognitive and Behavioral Neuroscience Major",
  "Computational and Systems Neuroscience Major",
  "Neuroscience Major",
  "Physics Major with Physics Education Option",
  "Physics Major with Pre-Health Option",
  "Physics Major with Pre-Law Option",
  "Physics Major",
  "Psychology Major",
  "Statistics Majors with Statistical Data Science Option",
  "Statistics Majors with Statistical Methods and Theory Option",
  "Advertising Major",
  "Communication Major",
  "Multimedia Journalism Major",
  "Public Relations Major",
  "Sports Media and Analytics Major",
  "Career and Technical Education - Agricultural Education Major",
  "Career and Technical Education Major with Business and Information Technologies Education Option",
  "Career and Technical Education Major with Family and Consumer Sciences Education Option",
  "Career and Technical Education Major with Marketing Education Option",
  "Elementary Education (PK-6) Major",
  "English Language Arts Education Major",
  "History and Social Sciences Education Major",
  "Mathematics Education Major",
  "Technology Education Major",
  "Creative Writing Major",
  "English Major with Literature Option",
  "English Major with Pre-Education Option",
  "English Major with Pre-Law Option",
  "Technical and Scientific Communication Major",
  "History Major with Undergraduate Research/Thesis Option",
  "History Major",
  "Early Childhood Development and Education Major",
  "Human Development Major",
  "Environment, Development, and Global Economy Major",
  "International Relations Major",
  "International Studies Major",
  "National Security & Foreign Affairs Major",
  "Arabic Major",
  "Classical Studies Major",
  "French Major",
  "German Major",
  "Russian Major",
  "Spanish Major",
  "Philosophy Major with Pre-Medical Professions Option",
  "Philosophy Major",
  "Philosophy, Politics, and Economics Major",
  "Political Science Major with Applied Public Policy Studies Option",
  "Political Science Major with Legal Studies Option",
  "Political Science Major with National Security Studies Option",
  "Political Science Major with Social and Political Justice Option",
  "Political Science Major",
  "Environmental Policy and Planning Major",
  "Urban Planning Major",
  "Criminology Major",
  "Sociology Major",
  "Fish Conservation Major with Freshwater Fisheries Conservation Option",
  "Fish Conservation Major with Human Dimensions Option",
  "Fish Conservation Major with Marine Fisheries Conservation Option",
  "Wildlife Conservation Major with Human Dimensions Option",
  "Wildlife Conservation Major",
  "Environmental Conservation & Society Major",
  "Environmental Data Science Major",
  "Environmental Resources Management Major",
  "Forestry Major with Forest Operations and Business Option",
  "Forestry Major with Forest Resources Management Option",
  "Forestry Major with Urban and Community Forestry Option",
  "Water: Resources, Policy, and Management Major",
  "Geography Major",
  "Geography Major with Applied Climate Science Option",
  "Geography Major with Environmental Geography Option",
  "Geography Major with Geographic Information Science and Technology Option",
  "Meteorology Major",
  "Packaging Systems and Design Major",
  "Sustainable Systems Science Major",
  "Accounting & Business Analysis Major",
  "Accounting and Information Systems Major",
  "Business Information Technology Major with Computer Based Decision Support Systems Option",
  "Cybersecurity Management and Analytics Major",
  "Business Information Technology Major with Operations and Supply Chain Management Option",
  "Finance Major with Corporate Financial Management Option",
  "Finance Major with Financial Accounting Option",
  "FinTech and Big Data Analytics Major",
  "Finance Major with Investment Management and Chartered Financial Analyst Option",
  "Financial Planning and Wealth Management Major",
  "Finance Major with Private Credit and Commercial Banking Major Option",
  "Event & Experience Management Major",
  "Hospitality and Tourism Management Major",
  "Human Resource Management Major",
  "Entrepreneurship, Innovation & Technology Management Major",
  "Management Consulting and Analytics Major",
  "Management Major",
  "Marketing Management Major",
  "Professional Sales in Marketing Major",
  "Real Estate Major",
  "Public Health Major",
  "Public Health Major with Pre-Medical Professions Option",
  "Public Health Major with Pre-Veterinary Professions Option",
];

// Hand-curated 2026-09-19 from the O*NET hot-technologies list categories
// (software, platforms, tools) plus the professional skills the four dream
// tiers in this form actually screen for (finance, consulting, research labs,
// government). The old typeahead had no list (it echoed the resume parse) and
// the Profile agent's schema enumerates none, so this is the vocabulary that
// `kjsbfjhhvfs` is refused against. Display casing is the canonical spelling.
export const SKILLS: readonly string[] = [
  // Languages
  "Python", "JavaScript", "TypeScript", "Java", "C", "C++", "C#", "Go", "Rust", "Kotlin", "Swift",
  "Objective-C", "Ruby", "PHP", "Scala", "R", "MATLAB", "Julia", "Perl", "Haskell", "Elixir", "Erlang",
  "Clojure", "Dart", "Lua", "Bash", "PowerShell", "SQL", "HTML", "CSS", "Sass", "Solidity", "Verilog",
  "VHDL", "Assembly", "Fortran", "COBOL", "OCaml", "F#", "Groovy", "Shell scripting",
  // Frontend
  "React", "Next.js", "Vue.js", "Nuxt", "Angular", "Svelte", "SvelteKit", "Redux", "Tailwind CSS",
  "Bootstrap", "Material UI", "Webpack", "Vite", "jQuery", "Three.js", "D3.js", "Storybook",
  "Web accessibility", "Responsive design", "Progressive web apps", "WebGL", "Electron", "Remix", "Astro",
  "Gatsby",
  // Backend and APIs
  "Node.js", "Express", "NestJS", "Django", "Flask", "FastAPI", "Spring Boot", "Spring", "ASP.NET", ".NET",
  "Ruby on Rails", "Laravel", "GraphQL", "REST APIs", "gRPC", "WebSockets", "Microservices", "Serverless",
  "OAuth", "JWT", "Socket.IO", "Celery", "RabbitMQ", "Apache Kafka", "Redis", "API design",
  // Mobile
  "React Native", "Flutter", "Android", "iOS", "SwiftUI", "Jetpack Compose", "Xamarin", "Ionic",
  "Kotlin Multiplatform", "Expo",
  // Databases and data platforms
  "PostgreSQL", "MySQL", "SQLite", "MongoDB", "Cassandra", "DynamoDB", "Firebase", "Supabase",
  "Oracle Database", "Microsoft SQL Server", "MariaDB", "Neo4j", "Elasticsearch", "Snowflake", "BigQuery",
  "Redshift", "Databricks", "Delta Lake", "Prisma", "SQLAlchemy", "Hibernate", "Database design",
  "Data modeling", "Data warehousing",
  // Cloud, DevOps, infrastructure
  "AWS", "Azure", "Google Cloud", "Docker", "Kubernetes", "Terraform", "Ansible", "Jenkins",
  "GitHub Actions", "GitLab CI", "CircleCI", "CI/CD", "Linux", "Nginx", "Apache HTTP Server", "Vercel",
  "Netlify", "Heroku", "Cloudflare", "AWS Lambda", "Amazon S3", "Amazon EC2", "Helm", "Prometheus",
  "Grafana", "Datadog", "Splunk", "Vagrant", "Puppet", "Chef", "Site reliability engineering",
  "Infrastructure as code", "Networking", "TCP/IP", "DNS", "Load balancing", "Virtualization", "VMware",
  "Windows Server", "Active Directory",
  // Data, ML, AI
  "Machine learning", "Deep learning", "Natural language processing", "Computer vision",
  "Reinforcement learning", "Artificial intelligence", "PyTorch", "TensorFlow", "Keras", "scikit-learn",
  "pandas", "NumPy", "SciPy", "Matplotlib", "Seaborn", "Plotly", "Jupyter", "Google Colab", "Hugging Face",
  "Transformers", "LangChain", "LLMs", "Prompt engineering", "Retrieval-augmented generation",
  "Vector databases", "MLflow", "Apache Spark", "PySpark", "Hadoop", "Apache Airflow", "dbt", "ETL",
  "Data engineering", "Data analysis", "Data visualization", "Statistics", "A/B testing",
  "Time series analysis", "Feature engineering", "Model deployment", "OpenCV", "CUDA", "XGBoost",
  "Recommender systems", "Tableau", "Power BI", "Looker", "Excel", "Google Sheets", "SAS", "SPSS", "Stata",
  "Bayesian statistics", "Optimization", "Operations research", "Simulation",
  // Security
  "Cybersecurity", "Penetration testing", "Network security", "Cryptography", "Security auditing", "OWASP",
  "Burp Suite", "Wireshark", "Metasploit", "Identity and access management", "SIEM", "Incident response",
  "Threat modeling", "Vulnerability assessment", "Digital forensics", "Reverse engineering",
  // Engineering practice and tools
  "Git", "GitHub", "GitLab", "Bitbucket", "Jira", "Confluence", "Agile", "Scrum", "Kanban",
  "Test-driven development", "Unit testing", "Jest", "Cypress", "Playwright", "Selenium", "Pytest", "JUnit",
  "Mocha", "Postman", "Swagger", "OpenAPI", "Figma", "VS Code", "IntelliJ IDEA", "Xcode", "Android Studio",
  "Visual Studio", "Eclipse", "Vim", "Code review", "Debugging", "Object-oriented programming",
  "Functional programming", "Data structures", "Algorithms", "System design", "Distributed systems",
  "Operating systems", "Compilers", "Computer architecture", "Embedded systems", "Arduino", "Raspberry Pi",
  "FPGA", "PCB design", "Robotics", "ROS", "Signal processing", "Control systems", "Simulink", "LabVIEW",
  "AutoCAD", "SolidWorks", "CATIA", "ANSYS", "Revit", "Finite element analysis",
  "Computational fluid dynamics", "3D printing", "CNC machining", "Lean manufacturing", "Six Sigma",
  "Quality assurance", "Blockchain", "Ethereum", "Smart contracts", "Unity", "Unreal Engine",
  "Game development", "Blender", "AR/VR", "Technical writing", "LaTeX", "Markdown", "Linux kernel",
  "Concurrency", "Performance optimization", "Accessibility", "Mobile development", "Web development",
  "Full-stack development", "Backend development", "Frontend development", "DevOps", "MLOps",
  // Finance, business, consulting
  "Financial modeling", "Financial analysis", "Valuation", "Discounted cash flow", "Accounting", "GAAP",
  "Auditing", "Tax", "Bookkeeping", "QuickBooks", "Bloomberg Terminal", "Capital IQ", "FactSet", "VBA",
  "Investment banking", "Private equity", "Venture capital", "Equity research", "Portfolio management",
  "Risk management", "Derivatives", "Fixed income", "Options trading", "Quantitative analysis",
  "Econometrics", "Economics", "Market research", "Marketing", "Digital marketing", "SEO", "SEM",
  "Google Analytics", "Content marketing", "Social media marketing", "Email marketing", "HubSpot",
  "Salesforce", "CRM", "Sales", "Business development", "Customer success", "Account management",
  "Product management", "Product strategy", "Roadmapping", "User research", "UX design", "UI design",
  "Wireframing", "Prototyping", "Adobe Photoshop", "Adobe Illustrator", "Adobe XD", "Adobe Premiere Pro",
  "After Effects", "Canva", "Graphic design", "Video editing", "Copywriting", "Public speaking",
  "Presentation skills", "Communication", "Leadership", "Teamwork", "Project management",
  "Program management", "PMP", "Microsoft Project", "Asana", "Trello", "Notion", "Slack",
  "Microsoft Office", "PowerPoint", "Microsoft Word", "Consulting", "Strategy", "Operations",
  "Supply chain management", "Logistics", "Procurement", "ERP", "SAP", "Oracle ERP", "Human resources",
  "Recruiting", "Training and development", "Negotiation", "Problem solving", "Critical thinking",
  "Time management", "Customer service", "Event planning", "Fundraising", "Grant writing",
  "Policy analysis", "Legal research", "Regulatory compliance", "Nonprofit management", "Teaching",
  "Curriculum development", "Mentoring", "Budgeting", "Forecasting", "Business analysis",
  "Requirements gathering", "Stakeholder management", "Change management", "Entrepreneurship",
  // Research, science, field
  "Research", "Literature review", "Laboratory techniques", "Data collection", "Survey design",
  "Qualitative research", "Quantitative research", "Scientific writing", "Clinical research",
  "Biostatistics", "Bioinformatics", "Molecular biology", "Chemistry", "Microscopy", "PCR",
  "Cell culture", "Chromatography", "Spectroscopy", "GIS", "ArcGIS", "QGIS", "Remote sensing",
  "Environmental modeling", "Sustainability", "Circuit design", "Thermodynamics", "Fluid mechanics",
  "Structural analysis", "Materials testing", "Surveying", "Hydrology", "Renewable energy",
  "Power systems", "Semiconductors", "Photonics", "Wireless communications", "Antenna design",
  "Animal handling", "Food safety", "HACCP",
  // Languages (human)
  "Spanish", "French", "German", "Mandarin Chinese", "Hindi", "Arabic", "Japanese", "Korean", "Portuguese",
  "Russian", "Italian", "American Sign Language",
];

// Alias -> canonical. Keys are folded (see fold()) so "Node JS", "node.js" and
// "nodejs" all hit the same row without a separate entry each.
const ALIASES: Record<string, string> = {
  js: "JavaScript", javascript: "JavaScript", ecmascript: "JavaScript", es6: "JavaScript",
  ts: "TypeScript", py: "Python", python3: "Python", node: "Node.js", nodejs: "Node.js",
  reactjs: "React", react: "React", nextjs: "Next.js", vue: "Vue.js", vuejs: "Vue.js", angularjs: "Angular",
  k8s: "Kubernetes", kube: "Kubernetes", tf: "TensorFlow", sklearn: "scikit-learn", scikit: "scikit-learn",
  ml: "Machine learning", dl: "Deep learning", nlp: "Natural language processing", cv: "Computer vision",
  ai: "Artificial intelligence", rl: "Reinforcement learning", genai: "LLMs", llm: "LLMs",
  "large language models": "LLMs", rag: "Retrieval-augmented generation", torch: "PyTorch",
  np: "NumPy", numpy: "NumPy", hf: "Hugging Face", huggingface: "Hugging Face",
  postgres: "PostgreSQL", psql: "PostgreSQL", postgresql: "PostgreSQL", mongo: "MongoDB", mongodb: "MongoDB",
  gcp: "Google Cloud", "google cloud platform": "Google Cloud", "amazon web services": "AWS",
  "microsoft azure": "Azure", "ms sql": "Microsoft SQL Server", "sql server": "Microsoft SQL Server",
  mssql: "Microsoft SQL Server", "c sharp": "C#", csharp: "C#", cpp: "C++", "c plus plus": "C++",
  golang: "Go", "objective c": "Objective-C", objc: "Objective-C", html5: "HTML", css3: "CSS", scss: "Sass",
  tailwind: "Tailwind CSS", tailwindcss: "Tailwind CSS", mui: "Material UI", dotnet: ".NET", "asp net": "ASP.NET",
  aspnet: "ASP.NET", rails: "Ruby on Rails", ror: "Ruby on Rails", "django rest framework": "Django",
  oop: "Object-oriented programming", "object oriented programming": "Object-oriented programming",
  dsa: "Data structures", "data structures and algorithms": "Data structures",
  tdd: "Test-driven development", "ci cd": "CI/CD", cicd: "CI/CD", "continuous integration": "CI/CD",
  iac: "Infrastructure as code", sre: "Site reliability engineering", "github action": "GitHub Actions",
  ppt: "PowerPoint", "microsoft powerpoint": "PowerPoint", "ms excel": "Excel", "microsoft excel": "Excel",
  "excel modeling": "Financial modeling", powerbi: "Power BI", sfdc: "Salesforce",
  "product manager": "Product management", dcf: "Discounted cash flow", ib: "Investment banking",
  pe: "Private equity", vc: "Venture capital", ux: "UX design", ui: "UI design", "ui ux": "UX design",
  "ux ui": "UX design", photoshop: "Adobe Photoshop", illustrator: "Adobe Illustrator", premiere: "Adobe Premiere Pro",
  "premiere pro": "Adobe Premiere Pro", ae: "After Effects", "adobe after effects": "After Effects",
  xd: "Adobe XD", chinese: "Mandarin Chinese", mandarin: "Mandarin Chinese", ros2: "ROS",
  unreal: "Unreal Engine", unity3d: "Unity", threejs: "Three.js", d3: "D3.js", "ms office": "Microsoft Office",
  "office 365": "Microsoft Office", s3: "Amazon S3", ec2: "Amazon EC2", lambda: "AWS Lambda",
  spark: "Apache Spark", kafka: "Apache Kafka", airflow: "Apache Airflow", elastic: "Elasticsearch",
  firestore: "Firebase", gql: "GraphQL", rest: "REST APIs", restful: "REST APIs", "restful apis": "REST APIs",
  "rest api": "REST APIs", "web sockets": "WebSockets", "micro services": "Microservices", rn: "React Native",
  vscode: "VS Code", intellij: "IntelliJ IDEA", gh: "GitHub", "jupyter notebook": "Jupyter", colab: "Google Colab",
  "jupyter notebooks": "Jupyter", matplot: "Matplotlib", "power point": "PowerPoint", word: "Microsoft Word",
  "ms word": "Microsoft Word", "google workspace": "Google Sheets", "g suite": "Google Sheets",
  "problem-solving": "Problem solving", presentations: "Presentation skills",
  "presentation": "Presentation skills", "team work": "Teamwork", collaboration: "Teamwork",
  "leadership skills": "Leadership", "communication skills": "Communication", "verbal communication": "Communication",
  "written communication": "Communication", "financial statements": "Financial analysis",
  "financial reporting": "Accounting", "cpa": "Accounting", "bloomberg": "Bloomberg Terminal",
  "capiq": "Capital IQ", "cfa": "Portfolio management", "trading": "Options trading", "stats": "Statistics",
  "statistical analysis": "Statistics", "data analytics": "Data analysis", "analytics": "Data analysis",
  "data science": "Data analysis", "data viz": "Data visualization", "dataviz": "Data visualization",
  "big data": "Data engineering", "etl pipelines": "ETL", "pipelines": "ETL", "web dev": "Web development",
  "full stack": "Full-stack development", fullstack: "Full-stack development", "back end": "Backend development",
  backend: "Backend development", "front end": "Frontend development", frontend: "Frontend development",
  "mobile app development": "Mobile development", "app development": "Mobile development",
  "ml ops": "MLOps", "dev ops": "DevOps", "infosec": "Cybersecurity", "security": "Cybersecurity",
  "pentesting": "Penetration testing", "pen testing": "Penetration testing", "ethical hacking": "Penetration testing",
  "linux administration": "Linux", "unix": "Linux", "shell": "Shell scripting", "bash scripting": "Bash",
  "sql queries": "SQL", "nosql": "MongoDB", "graph databases": "Neo4j", "vector db": "Vector databases",
  "vector search": "Vector databases", "embeddings": "Vector databases", "cad": "AutoCAD", "solid works": "SolidWorks",
  "fea": "Finite element analysis", "cfd": "Computational fluid dynamics", "plc": "Control systems",
  "iot": "Embedded systems", "internet of things": "Embedded systems", "microcontrollers": "Embedded systems",
  "asl": "American Sign Language", "sign language": "American Sign Language",
  "esp": "Spanish", "espanol": "Spanish", "deutsch": "German", "francais": "French", "japanese language": "Japanese",
  "korean language": "Korean", "arcgis pro": "ArcGIS", "gis mapping": "GIS", "sustainability analysis": "Sustainability",
  "lab": "Laboratory techniques", "lab techniques": "Laboratory techniques", "wet lab": "Laboratory techniques",
  "lit review": "Literature review", "academic writing": "Scientific writing", "research methods": "Research",
  "quant": "Quantitative analysis", "quant research": "Quantitative analysis", "econ": "Economics",
  "supply chain": "Supply chain management", "scm": "Supply chain management", "hr": "Human resources",
  "recruitment": "Recruiting", "talent acquisition": "Recruiting", "ops": "Operations",
  "operations management": "Operations", "biz dev": "Business development", "bd": "Business development",
  "mgmt consulting": "Consulting", "management consulting": "Consulting", "strategy consulting": "Consulting",
  "strat": "Strategy", "corporate strategy": "Strategy", "pm": "Product management", "prod mgmt": "Product management",
  "agile methodologies": "Agile", "scrum master": "Scrum", "lean": "Lean manufacturing", "six sigma green belt": "Six Sigma",
  "qa": "Quality assurance", "qa testing": "Quality assurance", "software testing": "Quality assurance",
  "test automation": "Selenium", "unit tests": "Unit testing", "e2e testing": "Playwright",
  "web3": "Blockchain", "crypto": "Blockchain", "defi": "Smart contracts", "vr": "AR/VR", "ar": "AR/VR",
  "xr": "AR/VR", "game dev": "Game development", "3d modeling": "Blender", "3d modelling": "Blender",
  "video production": "Video editing", "final cut": "Video editing", "final cut pro": "Video editing",
  "davinci resolve": "Video editing", "adobe creative suite": "Adobe Photoshop", "creative cloud": "Adobe Photoshop",
  "social media": "Social media marketing", "content creation": "Content marketing", "seo sem": "SEO",
  "google ads": "SEM", "paid search": "SEM", "ga4": "Google Analytics", "hubspot crm": "HubSpot",
  "salesforce crm": "Salesforce", "crm software": "CRM", "excel vba": "VBA", "macros": "VBA",
  "pivot tables": "Excel", "spreadsheets": "Excel", "sheets": "Google Sheets",
  "microsoft teams": "Microsoft Office", "outlook": "Microsoft Office", "onenote": "Microsoft Office",
  "public policy": "Policy analysis", "compliance": "Regulatory compliance", "legal writing": "Legal research",
  "grant proposals": "Grant writing", "fundraising campaigns": "Fundraising", "event management": "Event planning",
  "customer support": "Customer service", "client relations": "Account management",
  "tutoring": "Teaching", "instruction": "Teaching", "coaching": "Mentoring",
};

/** Lowercase, trim, collapse runs of whitespace, drop punctuation except + and #. */
function fold(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9+#\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Same as fold() but with the spaces removed too, so "node js" == "nodejs". */
function tight(input: string): string {
  return fold(input).replace(/\s+/g, "");
}

const BY_FOLD = new Map<string, string>();
const BY_TIGHT = new Map<string, string>();
for (const skill of SKILLS) {
  BY_FOLD.set(fold(skill), skill);
  BY_TIGHT.set(tight(skill), skill);
}
const ALIAS_BY_TIGHT = new Map<string, string>();
for (const [alias, canonical] of Object.entries(ALIASES)) {
  ALIAS_BY_TIGHT.set(tight(alias), canonical);
}

function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      next[j] = Math.min(prev[j] + 1, next[j - 1] + 1, prev[j - 1] + cost);
      if (next[j] < rowMin) rowMin = next[j];
    }
    if (rowMin > max) return max + 1;
    prev = next;
  }
  return prev[b.length];
}

export type NormalisedSkill = { ok: true; skill: string } | { ok: false; reason: string };

/**
 * Case-insensitive exact match, then the alias table, then a small edit
 * distance for inputs of 4+ characters (1 edit under 6 chars, 2 from 6 up, so
 * "pythn" corrects to Python but "xqz" never lands on anything). Everything
 * else is refused, naming the input, so `kjsbfjhhvfs` never reaches the agents.
 */
export function normaliseSkill(input: string): NormalisedSkill {
  const trimmed = input.trim();
  const refused = { ok: false as const, reason: `Not a recognised skill: "${trimmed}"` };
  const key = tight(trimmed);
  if (!key) return { ok: false, reason: "Not a recognised skill: (empty)" };

  const exact = BY_FOLD.get(fold(trimmed)) ?? BY_TIGHT.get(key);
  if (exact) return { ok: true, skill: exact };

  const alias = ALIAS_BY_TIGHT.get(key);
  if (alias) return { ok: true, skill: alias };

  if (key.length < 4) return refused;
  const max = key.length >= 6 ? 2 : 1;
  let best: { skill: string; distance: number } | null = null;
  for (const [candidate, skill] of BY_TIGHT) {
    const distance = levenshtein(key, candidate, max);
    if (distance <= max && (!best || distance < best.distance)) best = { skill, distance };
  }
  return best ? { ok: true, skill: best.skill } : refused;
}

/** Typeahead options: prefix matches first, then substring matches, never an already-picked skill. */
export function suggestSkills(query: string, exclude: readonly string[], limit: number): string[] {
  const q = fold(query);
  if (!q) return [];
  const taken = new Set(exclude);
  const prefix: string[] = [];
  const inner: string[] = [];
  for (const skill of SKILLS) {
    if (taken.has(skill)) continue;
    const f = fold(skill);
    if (f.startsWith(q)) prefix.push(skill);
    else if (f.includes(q)) inner.push(skill);
  }
  return [...prefix, ...inner].slice(0, limit);
}
