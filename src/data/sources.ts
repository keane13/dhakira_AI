export interface Source {
  id: string;
  citation: string;
  url: string;
  use: { en: string; ar: string; id?: string };
}

/** Each entry was checked against PubMed or the publisher's page on 2026-11-05. */
export const SOURCES: Source[] = [
  {
    id: 'S1',
    citation: 'Jacobson NS, Truax P. Clinical significance: a statistical approach to defining meaningful change in psychotherapy research. J Consult Clin Psychol. 1991;59(1):12-19.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/2002127/',
    use: { en: 'Rationale for reliable change. It does not validate this formula or its thresholds.', ar: 'الأساس المنطقي للتغيّر الموثوق. لا يثبت صحة هذه المعادلة أو عتباتها.' },
  },
  {
    id: 'S2',
    citation: 'Brooks BL, Holdnack JA, Iverson GL. To change is human: "abnormal" reliable change memory scores are common in healthy adults and older adults. Arch Clin Neuropsychol. 2016;31(8):1026-1036.',
    url: 'https://doi.org/10.1093/arclin/acw079',
    use: { en: 'A single changed score is common in healthy people, which is why one borderline result leads to a repeat, not a referral.', ar: 'تغيّر درجة واحدة شائع لدى الأصحاء، ولذلك تؤدي نتيجة حدّية واحدة إلى إعادة الفحص لا إلى الإحالة.' },
  },
  {
    id: 'S3',
    citation: 'Shrout PE, Fleiss JL. Intraclass correlations: uses in assessing rater reliability. Psychol Bull. 1979;86(2):420-428.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/18839484/',
    use: { en: 'Reference for the agreement statistic. Its worked example is one of this project\'s unit tests.', ar: 'مرجع إحصاء الاتفاق. مثاله المحسوب أحد الاختبارات البرمجية لهذا المشروع.' },
  },
  {
    id: 'S4',
    citation: 'Livingston G, Huntley J, Liu KY, et al. Dementia prevention, intervention, and care: 2024 report of the Lancet standing Commission. Lancet. 2024;404(10452):572-628.',
    url: 'https://doi.org/10.1016/S0140-6736(24)01296-0',
    use: { en: 'Modifiable risk factors used to organise prevention prompts. Population evidence, not an individual prediction.', ar: 'عوامل الخطر القابلة للتعديل المستخدمة لتنظيم إرشادات الوقاية. دليل سكاني وليس توقعًا فرديًا.' },
  },
  {
    id: 'S5',
    citation: 'World Health Organization. Risk reduction of cognitive decline and dementia: WHO guidelines, second edition. Geneva: WHO; 2026.',
    url: 'https://www.who.int/publications/i/item/9789240123557',
    use: { en: 'Guideline context for clinician discussion. It does not prove benefit from this prototype.', ar: 'سياق إرشادي لنقاش الطبيب. لا يثبت فائدة هذا النموذج الأولي.' },
  },
  {
    id: 'S6',
    citation: 'Ngandu T, Lehtisalo J, Solomon A, et al. A 2 year multidomain intervention of diet, exercise, cognitive training, and vascular risk monitoring versus control to prevent cognitive decline in at-risk elderly people (FINGER). Lancet. 2015;385(9984):2255-2263.',
    url: 'https://doi.org/10.1016/S0140-6736(15)60461-5',
    use: { en: 'Trial of a multidomain programme. Not evidence for any single activity here.', ar: 'تجربة لبرنامج متعدد المجالات. ليست دليلًا على أي نشاط منفرد هنا.' },
  },
  {
    id: 'S7',
    citation: 'Baker LD, Espeland MA, Whitmer RA, et al. Structured vs self-guided multidomain lifestyle interventions for global cognitive function: the US POINTER randomized clinical trial. JAMA. 2025;334(8):681-691.',
    url: 'https://doi.org/10.1001/jama.2025.12923',
    use: { en: 'Group-level difference between two programmes in a US population. Local relevance is untested.', ar: 'فرق على مستوى المجموعات بين برنامجين في سكان الولايات المتحدة. الملاءمة المحلية غير مختبرة.' },
  },
  {
    id: 'S8',
    citation: 'US Preventive Services Task Force. Screening for cognitive impairment in older adults: recommendation statement. JAMA. 2020;323(8):757-763.',
    url: 'https://doi.org/10.1001/jama.2020.0435',
    use: { en: 'Evidence on population screening was judged insufficient, which is why the validation plan measures harm as well as yield.', ar: 'اعتُبرت الأدلة على الفحص السكاني غير كافية، ولذلك تقيس خطة التحقق الضرر إلى جانب الفائدة.' },
  },
  {
    id: 'S9',
    citation: 'Storey JE, Rowland JTJ, Basic D, Conforti DA, Dickson HG. The Rowland Universal Dementia Assessment Scale (RUDAS): a multicultural cognitive assessment scale. Int Psychogeriatr. 2004;16(1):13-31.',
    url: 'https://doi.org/10.1017/s1041610204000043',
    use: { en: 'Example of designing items with cultural advisory groups, a method to follow in local co-design.', ar: 'مثال على تصميم البنود مع مجموعات استشارية ثقافية، وهي طريقة يُقتدى بها في التصميم المشترك المحلي.' },
  },
  {
    id: 'S10',
    citation: 'El-Hayeck R, Baddoura R, Wehbé A, et al. An Arabic version of the Mini-Mental State Examination for the Lebanese population: reliability, validity, and normative data. J Alzheimers Dis. 2019;71(2):525-540.',
    url: 'https://doi.org/10.3233/JAD-181232',
    use: { en: 'Shows that Arabic norms must be built per population. It is not a norm for Abu Dhabi.', ar: 'يبيّن أن المعايير العربية يجب أن تُبنى لكل مجتمع. ليس معيارًا لأبوظبي.' },
  },
  {
    id: 'S11',
    citation: 'El-Hayeck R, et al. An adapted Arabic version of the Test of Nine Images for the illiterate Lebanese population: validation and preliminary normative data. J Int Neuropsychol Soc. 2022.',
    url: 'https://doi.org/10.1017/S1355617722000236',
    use: { en: 'Precedent for picture-based memory items for people who do not read. It did not validate the items here.', ar: 'سابقة لبنود ذاكرة مصوّرة لمن لا يقرؤون. لم تتحقق من البنود المستخدمة هنا.' },
  },
  {
    id: 'S12',
    citation: 'Goldman JS, Hahn SE, Catania JW, et al. Genetic counseling and testing for Alzheimer disease: joint practice guidelines of the ACMG and NSGC. Genet Med. 2011;13(6):597-605.',
    url: 'https://doi.org/10.1097/GIM.0b013e31821d69b8',
    use: { en: 'Why genomic results are shown only with separate consent and a counselling prompt, and never change the route.', ar: 'سبب عرض النتائج الجينية بموافقة منفصلة ومع توجيه للاستشارة الوراثية، ودون أن تغيّر المسار.' },
  },
  {
    id: 'S13',
    citation: "Bateman RJ, Xiong C, Benzinger TLS, et al. Clinical and biomarker changes in dominantly inherited Alzheimer's disease. N Engl J Med. 2012;367(9):795-804.",
    url: 'https://doi.org/10.1056/NEJMoa1202753',
    use: { en: 'Background that change can start years before symptoms. Findings come from a dominantly inherited form.', ar: 'خلفية بأن التغيّر قد يبدأ قبل الأعراض بسنوات. النتائج من شكل وراثي سائد.' },
  },
  {
    id: 'S14',
    citation: 'National Institute on Aging. Assessing cognitive impairment in older patients.',
    url: 'https://www.nia.nih.gov/health/health-care-professionals-information/assessing-cognitive-impairment-older-patients',
    use: { en: 'Clinician guidance on reviewing possible contributors such as medicines, mood, sleep and sensory loss.', ar: 'إرشاد للأطباء حول مراجعة العوامل المحتملة مثل الأدوية والمزاج والنوم وفقدان الحواس.' },
  },
  {
    id: 'S15',
    citation: 'Bull FC, Al-Ansari SS, Biddle S, et al. World Health Organization 2020 guidelines on physical activity and sedentary behaviour. Br J Sports Med. 2020;54(24):1451-1462.',
    url: 'https://doi.org/10.1136/bjsports-2020-102955',
    use: { en: 'Source of the 150 minutes a week reference line for adults, including those with chronic conditions.', ar: 'مصدر الخط المرجعي البالغ 150 دقيقة أسبوعيًا للبالغين، بمن فيهم المصابون بأمراض مزمنة.', id: 'Sumber garis rujukan 150 menit per minggu untuk orang dewasa, termasuk yang memiliki penyakit kronis.' },
  },
  {
    id: 'S16',
    citation: 'Watson NF, Badr MS, Belenky G, et al. Recommended amount of sleep for a healthy adult: a joint consensus statement of the AASM and SRS. Sleep. 2015;38(6):843-844.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/26039963/',
    use: { en: 'Source of the 7 hours reference line. It covers adults up to 60, so older patients are read with that limit in mind.', ar: 'مصدر الخط المرجعي البالغ 7 ساعات. يشمل البالغين حتى 60 عامًا، لذا يُقرأ لكبار السن مع مراعاة هذا الحد.', id: 'Sumber garis rujukan 7 jam. Berlaku untuk dewasa sampai usia 60, jadi untuk pasien lebih tua dibaca dengan mempertimbangkan batas itu.' },
  },
  // S17 to S20 were checked on 2026-11-17: NICE on its own page, the others on PubMed.
  {
    id: 'S17',
    citation: 'National Institute for Health and Care Excellence. Dementia: assessment, management and support for people living with dementia and their carers (NG97). London: NICE; 2018. Recommendations 1.2.2 to 1.2.5.',
    url: 'https://www.nice.org.uk/guidance/ng97/chapter/Recommendations',
    use: {
      en: 'Outside specialist services, use a validated brief structured instrument such as the Mini-Cog. Do not rule out dementia on a normal score alone. Add an informant questionnaire, and do blood and urine tests for reversible causes.',
      ar: 'خارج الخدمات المتخصصة، استخدم أداة قصيرة منظمة ومعتمدة مثل Mini-Cog. لا تستبعد الخرف بناءً على درجة طبيعية وحدها. أضف استبيانًا للمخبر، وأجرِ فحوص الدم والبول للأسباب القابلة للعلاج.',
      id: 'Di luar layanan spesialis, gunakan instrumen singkat terstruktur yang tervalidasi seperti Mini-Cog. Jangan menyingkirkan demensia hanya karena skor normal. Tambahkan kuesioner informan, serta tes darah dan urine untuk penyebab yang bisa dipulihkan.',
    },
  },
  {
    id: 'S18',
    citation: 'Nasreddine ZS, Phillips NA, Bédirian V, et al. The Montreal Cognitive Assessment, MoCA: a brief screening tool for mild cognitive impairment. J Am Geriatr Soc. 2005;53(4):695-699.',
    url: 'https://doi.org/10.1111/j.1532-5415.2005.53221.x',
    use: {
      en: 'Describes the MoCA as a 10-minute, 30-point tool for first-line physicians. Its published cut-off came from a Canadian sample, so it is not applied here.',
      ar: 'يصف MoCA بأنه أداة من 10 دقائق و30 نقطة لأطباء الخط الأول. جاءت عتبته المنشورة من عينة كندية، لذا لا تُطبق هنا.',
      id: 'Menjelaskan MoCA sebagai alat 10 menit dengan 30 poin untuk dokter lini pertama. Batas skornya berasal dari sampel Kanada, jadi tidak diterapkan di sini.',
    },
  },
  {
    id: 'S19',
    citation: "Borson S, Scanlan J, Brush M, Vitaliano P, Dokmak A. The Mini-Cog: a cognitive 'vital signs' measure for dementia screening in multi-lingual elderly. Int J Geriatr Psychiatry. 2000;15(11):1021-1027.",
    url: 'https://doi.org/10.1002/1099-1166(200011)15:11<1021::aid-gps234>3.0.co;2-6',
    use: {
      en: 'Three-word recall and clock drawing in about 3 minutes, developed with a linguistically and educationally mixed sample of older adults.',
      ar: 'تذكر ثلاث كلمات ورسم الساعة في نحو 3 دقائق، طُوّر مع عينة من كبار السن متنوعة لغويًا وتعليميًا.',
      id: 'Mengingat tiga kata dan menggambar jam dalam sekitar 3 menit, dikembangkan dengan sampel lansia yang beragam bahasa dan pendidikannya.',
    },
  },
  {
    id: 'S20',
    citation: "Cordell CB, Borson S, Boustani M, et al. Alzheimer's Association recommendations for operationalizing the detection of cognitive impairment during the Medicare Annual Wellness Visit in a primary care setting. Alzheimers Dement. 2013;9(2):141-150.",
    url: 'https://doi.org/10.1016/j.jalz.2012.09.011',
    use: {
      en: 'A wellness-visit algorithm: health risk review, observation, brief structured tools for the patient and an informant, and further testing when needed.',
      ar: 'خوارزمية لزيارة العافية: مراجعة مخاطر الصحة والملاحظة وأدوات قصيرة منظمة للمريض والمخبر، ومزيد من الفحص عند الحاجة.',
      id: 'Algoritme untuk kunjungan kesehatan: tinjauan risiko kesehatan, observasi, alat singkat terstruktur untuk pasien dan informan, lalu pemeriksaan lanjutan bila perlu.',
    },
  },
  {
    id: 'S21',
    citation: 'By the 2023 American Geriatrics Society Beers Criteria Update Expert Panel. American Geriatrics Society 2023 updated AGS Beers Criteria for potentially inappropriate medication use in older adults. J Am Geriatr Soc. 2023;71(7):2052-2081.',
    url: 'https://doi.org/10.1111/jgs.18372',
    use: {
      en: 'Source of the two combination rules: several anticholinergic medicines together, and three or more CNS-active medicines together. Designed for the United States, so local adaptation is needed, and it supports rather than replaces clinical decisions.',
      ar: 'مصدر قاعدتي التركيب: عدة أدوية مضادة للكولين معًا، وثلاثة أدوية أو أكثر تؤثر في الجهاز العصبي المركزي معًا. صُممت للولايات المتحدة، لذا يلزم تكييفها محليًا، وهي تدعم القرار السريري ولا تحل محله.',
      id: 'Sumber dua aturan kombinasi: beberapa obat antikolinergik sekaligus, dan tiga atau lebih obat yang bekerja pada sistem saraf pusat sekaligus. Dirancang untuk Amerika Serikat, jadi perlu adaptasi lokal, dan mendukung bukan menggantikan keputusan klinis.',
    },
  },
];

export const sourceById = (id: string) => SOURCES.find((s) => s.id === id);
