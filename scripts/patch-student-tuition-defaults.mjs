import fs from 'node:fs';

const file = 'src/components/Students.tsx';
const marker = 'SYNC_STUDENT_TUITION_FROM_SETTINGS';
let src = fs.readFileSync(file, 'utf8');

if (src.includes(marker)) {
  console.log('[patch-student-tuition-defaults] already patched');
  process.exit(0);
}

const oldDefaults = `  const courseDefaultsByLicense = {
    A1: {
      courseType: 'Trọn gói hạng A1',
      totalFee: settings?.tuitionPrices?.A1 ?? 0,
      totalSessions: 2
    },
    A: {
      courseType: 'Trọn gói hạng A',
      totalFee: settings?.tuitionPrices?.A ?? 0,
      totalSessions: 2
    },
    'B số tự động': {
      courseType: 'Trọn gói hạng B số tự động',
      totalFee: settings?.tuitionPrices?.['B số tự động'] ?? 15000000,
      totalSessions: 14
    },
    'B số sàn': {
      courseType: 'Trọn gói hạng B số sàn',
      totalFee: settings?.tuitionPrices?.['B số sàn'] ?? 13000000,
      totalSessions: 20
    },
    C1: {
      courseType: 'Trọn gói hạng C1',
      totalFee: settings?.tuitionPrices?.C1 ?? 16000000,
      totalSessions: 16
    }
  };
`;

const newDefaults = `  // SYNC_STUDENT_TUITION_FROM_SETTINGS
  const getConfiguredTuitionPrice = (licenseClass: 'A1' | 'A' | 'B số tự động' | 'B số sàn' | 'C1'): number => {
    const raw = settings?.tuitionPrices?.[licenseClass];
    const numeric = Number(raw);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
  };

  const courseDefaultsByLicense: Record<'A1' | 'A' | 'B số tự động' | 'B số sàn' | 'C1', { courseType: string; totalFee: number; totalSessions: number }> = {
    A1: {
      courseType: 'Trọn gói hạng A1',
      totalFee: getConfiguredTuitionPrice('A1'),
      totalSessions: 2
    },
    A: {
      courseType: 'Trọn gói hạng A',
      totalFee: getConfiguredTuitionPrice('A') || getConfiguredTuitionPrice('A1'),
      totalSessions: 2
    },
    'B số tự động': {
      courseType: 'Trọn gói hạng B số tự động',
      totalFee: getConfiguredTuitionPrice('B số tự động'),
      totalSessions: 14
    },
    'B số sàn': {
      courseType: 'Trọn gói hạng B số sàn',
      totalFee: getConfiguredTuitionPrice('B số sàn'),
      totalSessions: 20
    },
    C1: {
      courseType: 'Trọn gói hạng C1',
      totalFee: getConfiguredTuitionPrice('C1'),
      totalSessions: 16
    }
  };
`;

if (!src.includes(oldDefaults)) {
  throw new Error('[patch-student-tuition-defaults] Could not find course defaults block');
}
src = src.replace(oldDefaults, newDefaults);

src = src.replace(
  `  const [newCourseType, setNewCourseType] = useState('Trọn gói hạng B số tự động');\n  const [newTotalFee, setNewTotalFee] = useState(15000000);\n  const [newTotalSessions, setNewTotalSessions] = useState(14);`,
  `  const [newCourseType, setNewCourseType] = useState(courseDefaultsByLicense['B số tự động'].courseType);\n  const [newTotalFee, setNewTotalFee] = useState(courseDefaultsByLicense['B số tự động'].totalFee);\n  const [newTotalSessions, setNewTotalSessions] = useState(courseDefaultsByLicense['B số tự động'].totalSessions);`
);

const stateAnchor = `  const [newNotes, setNewNotes] = useState('');\n  const [newTags, setNewTags] = useState<string[]>([]);\n`;
const syncEffect = `  const [newNotes, setNewNotes] = useState('');\n  const [newTags, setNewTags] = useState<string[]>([]);\n\n  useEffect(() => {\n    if (!isAdding) return;\n    const defaults = courseDefaultsByLicense[newLicenseClass];\n    if (!defaults) return;\n    setNewCourseType(defaults.courseType);\n    setNewTotalFee(defaults.totalFee);\n    setNewTotalSessions(defaults.totalSessions);\n  }, [\n    isAdding,\n    newLicenseClass,\n    settings?.tuitionPrices?.A1,\n    settings?.tuitionPrices?.A,\n    settings?.tuitionPrices?.['B số tự động'],\n    settings?.tuitionPrices?.['B số sàn'],\n    settings?.tuitionPrices?.C1\n  ]);\n`;
if (!src.includes(stateAnchor)) {
  throw new Error('[patch-student-tuition-defaults] Could not find new student state anchor');
}
src = src.replace(stateAnchor, syncEffect);

fs.writeFileSync(file, src);
console.log('[patch-student-tuition-defaults] patched Students.tsx tuition defaults from settings');
