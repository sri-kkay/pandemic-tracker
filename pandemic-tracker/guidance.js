/* ===========================================================================
   guidance.js — the educational layer behind the bottom-right drawer.

   The drawer has four tabs (Treat · Travel · Avoid · Prevent) and four FAQ
   chips (Symptoms · Early detection · Places to avoid · Ask something else).
   This file supplies all of it, for every disease the scrapers can emit.

   Two layers, in this order:

     1. LIBRARY   — hand-written, sourced entries for ~55 diseases. Covers
                    everything the seven adapters in outbreaks.js currently
                    produce, plus the diseases WHO Disease Outbreak News
                    publishes most often. This is the authoritative layer.

     2. autoFetch — when a disease appears that layer 1 has never seen (a new
                    WHO bulletin, a novel pathogen), this goes and reads the
                    public encyclopaedia entry for it, pulls the Treatment,
                    Prevention, Transmission, Symptoms and Diagnosis sections,
                    and builds a drawer entry from them. Marked `auto:true`
                    so the interface can label it as unverified.

   Nothing here needs an API key.
   =========================================================================== */

export const TABS = ['treatments', 'travel', 'avoid', 'prevention'];

export const DISCLAIMER =
  'General public-health information drawn from WHO and CDC guidance. ' +
  'Not medical advice — follow your national health authority.';

/* ---------------------------------------------------------------------------
   1. THE LIBRARY

   Every entry has the same six fields:
     treatments · travel · avoid · prevention   → the four drawer tabs
     symptoms   · detection                     → the two FAQ chips
   plus `aka` (name variants the scrapers might produce), `source` and `url`.

   `aka` matters more than it looks. WHO titles its bulletins things like
   "Middle East respiratory syndrome coronavirus – Saudi Arabia" and
   "Circulating vaccine-derived poliovirus type 2 (cVDPV2) – Nigeria". The
   resolver below matches on the longest alias found anywhere in the name, so
   both of those land on the right entry without anyone maintaining a list of
   every phrasing WHO has ever used.
   --------------------------------------------------------------------------- */

const LIBRARY = {

  /* ---------- mosquito, tick and rodent borne ---------- */

  'Dengue': {
    aka: ['dengue fever', 'severe dengue', 'dengue haemorrhagic fever', 'dengue hemorrhagic fever', 'denv'],
    treatments: [
      'No specific antiviral exists. Care is supportive: fluids, rest and paracetamol for fever and pain.',
      '<strong>Avoid ibuprofen, aspirin and other NSAIDs</strong> — they worsen the bleeding risk in severe dengue.',
      'Qdenga (TAK-003) is approved in a growing number of countries; Dengvaxia is restricted to people with confirmed prior infection.',
      'Warning signs — abdominal pain, persistent vomiting, bleeding gums, lethargy — mean hospital, same day.'
    ],
    travel: [
      'Risk peaks in and just after the rainy season across the Americas, South and South-East Asia, and the Pacific.',
      'Brazil currently has all four serotypes circulating at once, which raises the odds of severe disease on a second infection.',
      'No country requires a dengue vaccine for entry. Protection is mosquito avoidance, not paperwork.',
      'If you develop fever within two weeks of returning, tell the clinician where you travelled.'
    ],
    avoid: [
      'Standing water within about 100 m of where you sleep — pot plants, tyres, gutters, water storage drums.',
      'Being outdoors unprotected at dawn and dusk, when <em>Aedes aegypti</em> bites hardest.',
      'Ground-floor rooms without screens or air conditioning in high-transmission neighbourhoods.'
    ],
    prevention: [
      'Repellent containing DEET, picaridin or IR3535 on all exposed skin, reapplied as directed.',
      'Window and door screens; treated bed nets if sleeping during the day.',
      'Empty, scrub and cover every water container weekly — eggs survive drying for months.',
      'Long sleeves and trousers in light colours during daylight hours.'
    ],
    symptoms: [
      'Sudden high fever, severe headache, pain behind the eyes, muscle and joint pain, rash.',
      'Severe dengue begins 24–48 hours after the fever drops — that is the dangerous window, not the fever itself.'
    ],
    detection: [
      'NS1 antigen test detects infection from day 1 to about day 5; PCR over a similar window.',
      'IgM serology becomes useful from about day 5 onward.',
      'A daily full blood count tracks the platelet drop and haematocrit rise that flag severe disease.'
    ],
    source: 'WHO — Dengue and severe dengue fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/dengue-and-severe-dengue'
  },

  'Chikungunya': {
    aka: ['chikv', 'chikungunya fever', 'chikungunya virus disease'],
    treatments: [
      'No antiviral. Paracetamol for fever; NSAIDs only once dengue has been excluded, because the two overlap.',
      'Joint pain can persist for months — physiotherapy and graded movement help more than rest.',
      'Ixchiq (live-attenuated) and Vimkunya are licensed in some countries, mainly for travellers and outbreak response.'
    ],
    travel: [
      'Present across the Americas, Africa, South and South-East Asia and, increasingly, the Indian Ocean islands.',
      'Older travellers and those with heart, kidney or joint conditions have the worst outcomes.',
      'Discuss vaccination with a travel clinic if you are heading into an active outbreak.'
    ],
    avoid: [
      'Daytime mosquito exposure — the same <em>Aedes</em> mosquitoes that carry dengue.',
      'Standing water around accommodation.'
    ],
    prevention: [
      'DEET or picaridin repellent, applied over sunscreen, not under it.',
      'Screens, air conditioning and treated nets.',
      'Community source reduction — clearing breeding sites is the only measure that scales.'
    ],
    symptoms: [
      'Abrupt fever with severe, often disabling joint pain, usually symmetrical in hands, wrists, ankles and feet.',
      'Rash and headache are common. Deaths are rare but long-term arthritis is not.'
    ],
    detection: [
      'PCR in the first week of illness; IgM serology after that.',
      'Test for dengue at the same time — co-circulation is normal and management differs.'
    ],
    source: 'WHO — Chikungunya fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/chikungunya'
  },

  'Zika virus disease': {
    aka: ['zika', 'zikv', 'zika virus infection'],
    treatments: [
      'Supportive care only: rest, fluids, paracetamol. No antiviral and no vaccine.',
      'Avoid aspirin and NSAIDs until dengue is ruled out.',
      'Pregnant women with confirmed infection need serial ultrasound monitoring for fetal brain development.'
    ],
    travel: [
      'Pregnant women are advised not to travel to areas with ongoing transmission.',
      'After travel to an affected area, wait at least 2 months (women) or 3 months (men) before trying to conceive.',
      'Use condoms for the same period — Zika transmits sexually, which is unusual for an arbovirus.'
    ],
    avoid: [
      'Unprotected sex with a partner who has recently travelled to an affected area.',
      'Daytime mosquito exposure; the vector bites in daylight.'
    ],
    prevention: [
      'Repellent, screens, long clothing — the standard <em>Aedes</em> package.',
      'Barrier contraception during and after travel to affected areas.',
      'Blood donation deferral after travel, per national rules.'
    ],
    symptoms: [
      'Four in five infections cause no symptoms at all.',
      'When present: mild fever, rash, conjunctivitis, joint pain, lasting 2–7 days.',
      'The serious risk is congenital Zika syndrome in pregnancy, and Guillain-Barré syndrome in adults.'
    ],
    detection: [
      'PCR on blood or urine in the first two weeks; urine stays positive longer than blood.',
      'Serology cross-reacts heavily with dengue, so a positive IgM alone is not confirmation.'
    ],
    source: 'WHO — Zika virus fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/zika-virus'
  },

  'Oropouche fever': {
    aka: ['oropouche', 'oropouche virus disease', 'orov'],
    treatments: [
      'No antiviral, no vaccine. Rest, fluids and paracetamol.',
      'Avoid aspirin and NSAIDs — dengue circulates in the same areas and looks similar early on.',
      'Relapse a week or two after apparent recovery happens in up to 60% of cases and is expected, not a new infection.'
    ],
    travel: [
      'Amazon basin plus recent expansion into north-east Brazil, Cuba and other Caribbean and Andean areas since 2024.',
      'Pregnant travellers should seek advice — vertical transmission has been reported.',
      'Standard mosquito precautions are only partly effective because the main vector is a biting midge.'
    ],
    avoid: [
      'Dusk and dawn exposure near riverbanks, banana and cacao plantations, where the <em>Culicoides</em> midge breeds.',
      'Unscreened accommodation in affected rural areas — midges pass through ordinary mosquito netting.'
    ],
    prevention: [
      'Fine-mesh nets — standard mosquito mesh is too coarse to stop midges.',
      'DEET or picaridin repellent and long clothing at dawn and dusk.',
      'Clear rotting vegetation and plant debris near dwellings.'
    ],
    symptoms: [
      'Sudden fever, severe headache, muscle and joint pain, nausea, photophobia — clinically near-identical to dengue.',
      'Symptoms last about a week; recurrence after a symptom-free gap is characteristic.'
    ],
    detection: [
      'RT-PCR in the first 5 days of illness. Most routine arbovirus panels do not include it — it must be requested.',
      'Serology available at reference laboratories only.'
    ],
    source: 'PAHO — Oropouche epidemiological alerts',
    url: 'https://www.paho.org/en/topics/oropouche'
  },

  'Yellow fever': {
    aka: ['yellow fever virus', 'febre amarela'],
    treatments: [
      'No antiviral. Supportive care: fluids, dialysis if kidneys fail, management of bleeding.',
      'Avoid aspirin and NSAIDs — they compound the haemorrhagic risk.',
      'Severe cases need intensive care; case fatality among those entering the toxic phase is 30–60%.'
    ],
    travel: [
      'A single dose of vaccine gives lifelong protection for most people, effective 10 days after injection.',
      'Many countries require a valid International Certificate of Vaccination for entry from endemic areas — carry the yellow card.',
      'Transmission now extends beyond the traditional Amazon hotspots into São Paulo state and the Andean foothills.'
    ],
    avoid: [
      'Unvaccinated travel to any endemic zone. There is no substitute for the vaccine here.',
      'Daytime exposure in and near forest, where the sylvatic cycle runs.'
    ],
    prevention: [
      'Vaccinate at least 10 days before departure.',
      'Repellent and long sleeves — the urban vector is <em>Aedes aegypti</em>, a daytime biter.',
      'Watch for die-offs of howler monkeys: they are the standard early-warning signal for a sylvatic outbreak.'
    ],
    symptoms: [
      'First phase: fever, muscle pain, headache, nausea — indistinguishable from many other fevers.',
      'Most people recover. About 15% enter a toxic phase within 24 hours of apparent recovery: jaundice, dark urine, abdominal pain, bleeding.'
    ],
    detection: [
      'PCR early in illness; serology later, though it cross-reacts with dengue and vaccination.',
      'Jaundice plus fever plus recent forest exposure in an endemic country is treated as yellow fever until proven otherwise.'
    ],
    source: 'WHO — Yellow fever fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/yellow-fever'
  },

  'Malaria': {
    aka: ['plasmodium', 'falciparum', 'p. falciparum', 'vivax'],
    treatments: [
      'Artemisinin-based combination therapy (ACT) is first-line for <em>P. falciparum</em> nearly everywhere.',
      'Severe malaria is treated with intravenous artesunate, then a full oral course.',
      '<em>P. vivax</em> and <em>P. ovale</em> also need primaquine or tafenoquine to clear the liver stage — check G6PD status first.',
      'Treatment is urgent: falciparum malaria can kill within 24 hours of the first symptom.'
    ],
    travel: [
      'Chemoprophylaxis (atovaquone-proguanil, doxycycline or mefloquine) for travel to transmission areas — start before departure and finish the full course after return.',
      'The RTS,S and R21 vaccines are for children in endemic countries, not travellers.',
      'Any fever within a year of returning from a malaria area is malaria until a blood test says otherwise.'
    ],
    avoid: [
      'Being outdoors between dusk and dawn without cover — <em>Anopheles</em> bites at night, unlike the dengue mosquito.',
      'Sleeping without a net in rural accommodation.',
      'Stopping prophylaxis early because you feel fine.'
    ],
    prevention: [
      'Long-lasting insecticidal net over the bed, every night.',
      'Repellent on exposed skin, permethrin on clothing.',
      'Indoor residual spraying where local programmes offer it.'
    ],
    symptoms: [
      'Fever, chills, sweats, headache, body aches, sometimes vomiting and diarrhoea — the classic cyclical fever is often absent.',
      'Severe signs: confusion, seizures, difficulty breathing, dark urine, jaundice.'
    ],
    detection: [
      'Rapid diagnostic test gives an answer in 20 minutes and is available at most clinics in endemic areas.',
      'Microscopy of a thick and thin blood film remains the reference standard and gives the parasite count.',
      'A single negative test does not exclude malaria — repeat at 12–24 hours if suspicion is high.'
    ],
    source: 'WHO — Malaria fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/malaria'
  },

  'West Nile fever': {
    aka: ['west nile', 'west nile virus', 'wnv', 'west nile neuroinvasive disease'],
    treatments: [
      'No antiviral and no human vaccine. Supportive care.',
      'Neuroinvasive disease needs hospital admission — encephalitis, meningitis and acute flaccid paralysis all occur.',
      'Recovery from the neuroinvasive form is often slow and incomplete in older patients.'
    ],
    travel: [
      'Seasonal risk in southern and central Europe, North America, Africa and West Asia, peaking late summer.',
      'Risk of severe disease rises sharply over age 60 and with diabetes, hypertension or immunosuppression.'
    ],
    avoid: [
      'Evening and overnight exposure near irrigation, wetlands and stagnant water — <em>Culex</em> mosquitoes bite at night.',
      'Handling dead birds bare-handed during an outbreak.'
    ],
    prevention: [
      'Repellent and long clothing from dusk onward.',
      'Screens on windows; drain standing water around the house.',
      'Blood services in affected regions screen or defer donors during transmission season.'
    ],
    symptoms: [
      'Four out of five infections are silent.',
      'Mild illness: fever, headache, body aches, sometimes a rash.',
      'Fewer than 1 in 150 develop neuroinvasive disease — high fever, stiff neck, confusion, tremors, weakness.'
    ],
    detection: [
      'IgM serology on serum or cerebrospinal fluid is the usual route.',
      'PCR has a narrow window and is often negative by the time symptoms appear.'
    ],
    source: 'WHO — West Nile virus fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/west-nile-virus'
  },

  'Japanese encephalitis': {
    aka: ['japanese encephalitis virus', 'jev'],
    treatments: [
      'No antiviral. Supportive intensive care — control of seizures and intracranial pressure.',
      'Case fatality among those who develop encephalitis is around 30%, and up to half of survivors keep lasting neurological damage.'
    ],
    travel: [
      'Vaccine (IXIARO / live SA 14-14-2) is recommended for stays over a month in rural transmission areas of Asia during the season.',
      'Risk is rural and agricultural — rice paddies and pig farming — not urban.',
      'Two doses given 28 days apart for the inactivated vaccine; complete the course at least a week before departure.'
    ],
    avoid: [
      'Overnight stays near rice fields and pig farms without a net during the transmission season.',
      'Dusk-to-dawn outdoor exposure in rural areas.'
    ],
    prevention: [
      'Vaccination is the only reliable protection for extended rural travel.',
      'Bed nets and repellent; the vector is a night-biting <em>Culex</em>.'
    ],
    symptoms: [
      'Most infections cause nothing at all.',
      'When encephalitis develops: high fever, headache, neck stiffness, disorientation, seizures, paralysis.'
    ],
    detection: [
      'IgM antibody capture ELISA on cerebrospinal fluid or serum.',
      'Imaging shows a characteristic thalamic pattern that supports the diagnosis.'
    ],
    source: 'WHO — Japanese encephalitis fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/japanese-encephalitis'
  },

  'Rift Valley fever': {
    aka: ['rvf', 'rift valley'],
    treatments: [
      'No licensed antiviral or human vaccine. Supportive care.',
      'Most people recover; a minority develop retinitis, encephalitis or a haemorrhagic form with high mortality.',
      'Vision loss from retinitis appears 1–3 weeks after the fever and may be permanent.'
    ],
    travel: [
      'Outbreaks follow unusually heavy rainfall in East Africa, the Sahel and the Arabian Peninsula.',
      'Risk is occupational — herders, abattoir workers, vets — far more than it is touristic.'
    ],
    avoid: [
      'Slaughtering, butchering or handling sick livestock, and contact with aborted animal tissue.',
      'Unpasteurised milk from affected herds.',
      'Mosquito exposure at dawn and dusk during an outbreak.'
    ],
    prevention: [
      'Gloves and eye protection for anyone handling animals or animal tissue in an affected area.',
      'Boil or pasteurise all milk.',
      'Livestock vaccination before the rains — the intervention that actually stops human cases.'
    ],
    symptoms: [
      'Sudden fever, muscle and joint pain, headache; usually resolves in a week.',
      'Severe forms: blurred vision, jaundice, bleeding, confusion.'
    ],
    detection: [
      'RT-PCR or IgM ELISA at a reference laboratory.',
      'Watch for a wave of livestock abortions — that is the outbreak signal that precedes human cases.'
    ],
    source: 'WHO — Rift Valley fever fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/rift-valley-fever'
  },

  'Crimean-Congo haemorrhagic fever': {
    aka: ['cchf', 'crimean congo', 'crimean-congo hemorrhagic fever'],
    treatments: [
      'Supportive care is the mainstay: fluids, blood products, organ support.',
      'Ribavirin is used in some countries; the evidence for benefit is weak and contested.',
      'Case fatality runs 10–40%. Health-care transmission is a real and repeated risk.'
    ],
    travel: [
      'Endemic across the Balkans, Turkey, the Middle East, Central Asia and much of Africa.',
      'Risk is tied to tick exposure and livestock contact rather than to ordinary tourism.'
    ],
    avoid: [
      'Tick-infested pasture and scrub without covered clothing.',
      'Bare-handed contact with livestock blood or fresh carcasses.',
      'Crushing ticks with fingers when removing them.'
    ],
    prevention: [
      'Light-coloured clothing, trousers tucked into socks, permethrin-treated fabric.',
      'Full-body tick check at the end of each day; remove attached ticks with tweezers, straight out.',
      'Gloves for anyone handling animals or animal tissue.'
    ],
    symptoms: [
      'Abrupt fever, muscle pain, dizziness, back and neck pain, vomiting.',
      'From about day 4: bruising, nosebleeds, bleeding from injection sites, enlarged liver.'
    ],
    detection: [
      'PCR and IgM/IgG ELISA at a biosafety level 4 or specialist reference laboratory.',
      'Suspicion is driven by tick bite or livestock contact in the previous two weeks.'
    ],
    source: 'WHO — Crimean-Congo haemorrhagic fever fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/crimean-congo-haemorrhagic-fever'
  },

  'Plague': {
    aka: ['yersinia pestis', 'bubonic plague', 'pneumonic plague', 'septicaemic plague'],
    treatments: [
      'Antibiotics work and work fast — aminoglycosides, fluoroquinolones or doxycycline.',
      'Treatment must start within 24 hours of the first symptoms of pneumonic plague to be reliably effective.',
      'Post-exposure prophylaxis for close contacts of pneumonic cases.'
    ],
    travel: [
      'Endemic foci in Madagascar, the Democratic Republic of the Congo, Peru and the western United States.',
      'No vaccine is in general use. Prevention is rodent and flea avoidance.'
    ],
    avoid: [
      'Handling dead or sick rodents, and areas with visible rodent die-offs.',
      'Camping or sleeping on the ground near rodent burrows in endemic areas.',
      'Close contact with anyone coughing in a pneumonic plague outbreak, without a respirator.'
    ],
    prevention: [
      'Insect repellent with DEET on skin and permethrin on clothing in endemic rural areas.',
      'Keep food sealed and rodents out of dwellings.',
      'Respiratory protection and isolation for suspected pneumonic cases.'
    ],
    symptoms: [
      'Bubonic: sudden fever, chills, and a swollen, intensely painful lymph node (bubo).',
      'Pneumonic: fever with rapidly worsening cough, chest pain and bloody sputum — fatal within days if untreated.'
    ],
    detection: [
      'Rapid dipstick antigen test on bubo aspirate or sputum, then culture or PCR to confirm.',
      'Treat on clinical suspicion; do not wait for laboratory confirmation.'
    ],
    source: 'WHO — Plague fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/plague'
  },

  'Leishmaniasis': {
    aka: ['visceral leishmaniasis', 'kala-azar', 'cutaneous leishmaniasis'],
    treatments: [
      'Visceral disease: liposomal amphotericin B, or miltefosine, or antimonials depending on region and resistance.',
      'Cutaneous lesions often heal on their own but leave scars; local or systemic therapy is used for disfiguring or mucosal disease.',
      'Untreated visceral leishmaniasis is fatal in more than 95% of cases.'
    ],
    travel: [
      'Present in East Africa, the Indian subcontinent, Brazil and around the Mediterranean.',
      'No vaccine or prophylactic drug. Avoidance of sandfly bites is the whole strategy.'
    ],
    avoid: [
      'Outdoor exposure from dusk to dawn in endemic rural areas — sandflies are silent, night-biting and tiny.',
      'Sleeping outdoors or in unscreened rooms at ground level.'
    ],
    prevention: [
      'Fine-mesh insecticide-treated nets — ordinary mosquito mesh lets sandflies through.',
      'DEET repellent and permethrin-treated clothing.',
      'Reduce sandfly habitat: clear rubble, rubbish and animal shelters near dwellings.'
    ],
    symptoms: [
      'Visceral: prolonged irregular fever, weight loss, enlarged spleen and liver, anaemia.',
      'Cutaneous: painless skin ulcers with a raised edge, appearing weeks to months after the bite.'
    ],
    detection: [
      'rK39 rapid test for visceral disease; splenic or bone-marrow aspirate as the reference standard.',
      'Skin scraping or biopsy with PCR for cutaneous disease.'
    ],
    source: 'WHO — Leishmaniasis fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/leishmaniasis'
  },

  /* ---------- vaccine-preventable ---------- */

  'Measles': {
    aka: ['rubeola', 'morbillivirus', 'measles-rubella'],
    treatments: [
      'No antiviral. Vitamin A on two consecutive days reduces mortality in children and is recommended for every case.',
      'Treat the complications — pneumonia, otitis media, diarrhoea — as they arise.',
      'Post-exposure MMR within 72 hours, or immunoglobulin within 6 days, can prevent or soften disease in contacts.'
    ],
    travel: [
      'Confirm two documented MMR doses before departure; the second dose can be given as little as 28 days after the first.',
      'Infants aged 6–11 months travelling to an outbreak area should get an early dose, which does not count toward the routine two.',
      'Measles is circulating in every WHO region right now, including in high-income countries with falling coverage.'
    ],
    avoid: [
      'Crowded indoor spaces during an active outbreak — the virus stays infectious in the air for up to two hours after the case has left.',
      'Emergency departments and clinic waiting rooms with a suspected case present, unless you are immune.',
      'Contact between an infectious case and infants, pregnant women or anyone immunocompromised.'
    ],
    prevention: [
      'Two doses of MMR are about 97% effective and protection is lifelong.',
      'Isolate cases from four days before to four days after rash onset.',
      'Outbreak response needs coverage above 95% in the affected community — measles is the most contagious human virus known.'
    ],
    symptoms: [
      'Fever, cough, runny nose and red watery eyes for 2–4 days first.',
      'Koplik spots — tiny white spots inside the cheek — appear before the rash and are diagnostic.',
      'Rash starts at the hairline and spreads downward.'
    ],
    detection: [
      'Measles-specific IgM in serum, or PCR on a throat swab or urine.',
      'Collect the swab as early as possible — PCR sensitivity falls off after about 3 days of rash.'
    ],
    source: 'WHO — Measles fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/measles'
  },

  'Rubella': {
    aka: ['german measles', 'congenital rubella syndrome'],
    treatments: [
      'No specific treatment. The illness is mild and self-limiting in children and adults.',
      'The reason rubella matters is congenital rubella syndrome — deafness, cataracts and heart defects in babies infected in the first trimester.'
    ],
    travel: [
      'Women of childbearing age should confirm rubella immunity before travelling or planning pregnancy.',
      'MMR is a live vaccine: not given in pregnancy, and pregnancy should be avoided for 28 days after.'
    ],
    avoid: [
      'Contact between a case and any pregnant woman whose immunity is not documented.'
    ],
    prevention: [
      'Rubella-containing vaccine, given as MMR, is over 95% effective after one dose.',
      'Exclude cases from work or school for 7 days after rash onset.'
    ],
    symptoms: [
      'Low fever, a fine pink rash starting on the face, and swollen lymph nodes behind the ears and neck.',
      'Joint pain is common in adult women. Up to half of infections cause no rash at all.'
    ],
    detection: [
      'Rubella IgM serology, or PCR on a throat swab.',
      'Screen every pregnant woman for immunity at the first antenatal visit.'
    ],
    source: 'WHO — Rubella fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/rubella'
  },

  'Mumps': {
    aka: ['mumps virus', 'parotitis'],
    treatments: [
      'Supportive only — analgesia, cold compresses, soft food.',
      'Watch for orchitis, meningitis and hearing loss, which are the complications that matter.'
    ],
    travel: [
      'Two MMR doses give good but not perfect protection; breakthrough outbreaks occur in universities and among young adults.'
    ],
    avoid: [
      'Sharing drinks, utensils and cigarettes during an outbreak.',
      'Close contact settings — dormitories, sports teams — while symptomatic.'
    ],
    prevention: [
      'Two-dose MMR, roughly 88% effective against mumps.',
      'Isolate for 5 days from the onset of swelling.'
    ],
    symptoms: [
      'Fever and headache followed by painful swelling of one or both parotid glands, in front of and below the ear.'
    ],
    detection: [
      'PCR on a buccal swab taken from the parotid duct within 3 days of swelling; IgM serology is less reliable in vaccinated people.'
    ],
    source: 'WHO — Mumps',
    url: 'https://www.who.int/teams/health-product-policy-and-standards/standards-and-specifications/norms-and-standards/vaccine-standardization/mumps'
  },

  'Polio': {
    aka: ['poliomyelitis', 'poliovirus', 'cvdpv', 'cvdpv1', 'cvdpv2', 'cvdpv3', 'wild poliovirus', 'wpv1',
          'vaccine-derived poliovirus', 'circulating vaccine-derived poliovirus', 'acute flaccid paralysis'],
    treatments: [
      'No cure. Care is supportive: physiotherapy, orthotics, ventilation if breathing muscles are affected.',
      'Paralysis, once established, is permanent in most cases.',
      'Outbreak response is mass vaccination, not treatment.'
    ],
    travel: [
      'Some countries with active transmission require proof of polio vaccination within the previous 12 months to exit.',
      'Adults travelling to affected areas should have a one-time IPV booster on top of a completed childhood course.',
      'Check the current IHR temporary recommendations before booking — the country list changes.'
    ],
    avoid: [
      'Untreated water and food washed in it, in areas with detected transmission.',
      'Missing or delaying a child\'s vaccination round during an outbreak response campaign.'
    ],
    prevention: [
      'Full childhood schedule of inactivated (IPV) or oral (OPV) vaccine.',
      'Handwashing and safe sanitation — polio spreads by the faecal-oral route.',
      'Environmental sewage surveillance detects circulation before any child is paralysed, which is why detections are reported with no cases.'
    ],
    symptoms: [
      'About 70% of infections cause nothing. Most of the rest cause a brief fever, sore throat and nausea.',
      'Fewer than 1 in 200 develop sudden asymmetric floppy paralysis, usually of the legs, over hours to days.'
    ],
    detection: [
      'Stool culture and sequencing — two specimens 24 hours apart, within 14 days of paralysis onset.',
      'Any case of acute flaccid paralysis in a child under 15 is investigated as polio until excluded.'
    ],
    source: 'WHO — Poliomyelitis fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/poliomyelitis'
  },

  'Diphtheria': {
    aka: ['corynebacterium diphtheriae', 'diphtheritic'],
    treatments: [
      'Diphtheria antitoxin, given on clinical suspicion without waiting for culture — the toxin binds irreversibly, so hours matter.',
      'Antibiotics (erythromycin or penicillin) clear the organism and stop transmission but do not neutralise circulating toxin.',
      'Airway management: the pseudomembrane can obstruct breathing.'
    ],
    travel: [
      'Confirm a diphtheria-containing booster (Td or Tdap) within the last 10 years.',
      'Outbreaks cluster where routine immunisation has broken down — conflict zones, displacement camps.'
    ],
    avoid: [
      'Close contact with a symptomatic case without prophylaxis.',
      'Crowded, poorly ventilated living conditions during an outbreak.'
    ],
    prevention: [
      'DTP/Td vaccination, with boosters every 10 years.',
      'Antibiotic prophylaxis and a booster dose for household contacts.',
      'Isolate cases until two negative cultures 24 hours apart.'
    ],
    symptoms: [
      'Sore throat, low fever, and a thick grey-white membrane over the tonsils and throat that bleeds if scraped.',
      'Swollen neck glands giving a "bull neck" appearance in severe disease.',
      'Late complications: myocarditis and nerve palsies, from the toxin.'
    ],
    detection: [
      'Swab from beneath the membrane for culture on selective medium; PCR for the toxin gene.',
      'Tell the laboratory you suspect diphtheria — it needs a specific medium that is not used routinely.'
    ],
    source: 'WHO — Diphtheria',
    url: 'https://www.who.int/health-topics/diphtheria'
  },

  'Pertussis': {
    aka: ['whooping cough', 'bordetella pertussis', '100 day cough'],
    treatments: [
      'Macrolide antibiotics (azithromycin, clarithromycin) shorten infectiousness and help if started in the first 1–2 weeks.',
      'Started later, antibiotics stop transmission but do little for the cough, which runs for weeks either way.',
      'Infants under 6 months often need hospital care; that is where the deaths occur.'
    ],
    travel: [
      'Tdap booster recommended for adults in contact with infants, and in pregnancy at 27–36 weeks for every pregnancy.'
    ],
    avoid: [
      'Contact between a coughing case and any infant under 12 months.',
      'Delaying the infant primary course — protection depends on getting the first doses on time.'
    ],
    prevention: [
      'Maternal Tdap in the third trimester protects the newborn before their own vaccination starts.',
      'Antibiotic prophylaxis for household contacts of a case.',
      'Immunity wanes, so boosters matter — a fully vaccinated adult can still carry and transmit.'
    ],
    symptoms: [
      'Starts like an ordinary cold for 1–2 weeks.',
      'Then bursts of violent coughing, sometimes with a whooping intake of breath or vomiting afterward.',
      'Infants may not cough at all — they stop breathing instead.'
    ],
    detection: [
      'PCR on a nasopharyngeal swab, best within 3 weeks of cough onset.',
      'Serology for people presenting later in the illness.'
    ],
    source: 'WHO — Pertussis',
    url: 'https://www.who.int/health-topics/pertussis'
  },

  'Meningococcal disease': {
    aka: ['meningitis', 'meningococcal meningitis', 'neisseria meningitidis', 'bacterial meningitis', 'meningococcaemia'],
    treatments: [
      'Immediate intravenous antibiotics — ceftriaxone or benzylpenicillin — before any imaging or lumbar puncture if that would delay treatment.',
      'Every hour of delay increases mortality. Untreated, it kills in a day.',
      'Intensive care for shock and raised intracranial pressure.'
    ],
    travel: [
      'ACWY vaccine required for Hajj and Umrah pilgrims, and recommended for the African meningitis belt in the dry season (December–June).',
      'Separate B-serogroup vaccines exist and are not covered by ACWY.'
    ],
    avoid: [
      'Crowded sleeping quarters during an outbreak — dormitories, barracks, pilgrimage accommodation.',
      'Sharing drinks, cutlery, cigarettes and vapes.'
    ],
    prevention: [
      'Conjugate ACWY and MenB vaccination per national schedule.',
      'Antibiotic prophylaxis for household and kissing contacts, given within 24 hours.',
      'Reactive mass vaccination when an epidemic threshold is crossed in the meningitis belt.'
    ],
    symptoms: [
      'Sudden fever, severe headache, stiff neck, photophobia, confusion, vomiting.',
      'A rash that does not fade under pressure means septicaemia and is a medical emergency.',
      'In infants: high-pitched cry, bulging fontanelle, floppiness, refusing feeds.'
    ],
    detection: [
      'Lumbar puncture with Gram stain, culture and PCR on cerebrospinal fluid; blood culture and PCR alongside.',
      'Do not delay antibiotics to obtain samples.'
    ],
    source: 'WHO — Meningitis fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/meningitis'
  },

  'Typhoid fever': {
    aka: ['typhoid', 'salmonella typhi', 'enteric fever', 'paratyphoid'],
    treatments: [
      'Antibiotics guided by local resistance — azithromycin or a third-generation cephalosporin in most settings.',
      'Extensively drug-resistant (XDR) strains are established in Pakistan and spreading; fluoroquinolones often fail.',
      'Untreated typhoid kills roughly 1 in 5; treated, under 1%.'
    ],
    travel: [
      'Typhoid conjugate vaccine or the older Vi polysaccharide/oral Ty21a for travel to South Asia, sub-Saharan Africa and parts of Latin America.',
      'Vaccine is roughly 50–80% effective — food and water care still matters afterward.'
    ],
    avoid: [
      'Untreated water, ice, and drinks made with either.',
      'Raw salads, unpeeled fruit and food from stalls with no handwashing facilities.',
      'Food prepared by anyone who is a known carrier.'
    ],
    prevention: [
      'Boil it, cook it, peel it, or leave it.',
      'Handwashing with soap, especially before eating and after the toilet.',
      'Safe sanitation and water treatment are the population-level fix.'
    ],
    symptoms: [
      'Fever that climbs step-wise over several days, headache, abdominal pain, constipation more often than diarrhoea.',
      'Faint pink spots on the trunk in some patients.',
      'Intestinal perforation in week 3 is the classic severe complication.'
    ],
    detection: [
      'Blood culture in the first week is the reference standard; bone marrow culture is more sensitive but rarely done.',
      'The Widal test is widely used and widely unreliable — treat its results with caution.'
    ],
    source: 'WHO — Typhoid fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/typhoid'
  },

  'Hepatitis A': {
    aka: ['hep a', 'hav'],
    treatments: [
      'No specific treatment. Rest, fluids, and avoidance of alcohol and paracetamol overdose while the liver recovers.',
      'Almost everyone recovers fully; fulminant hepatitis is rare but more likely over age 50 or with existing liver disease.'
    ],
    travel: [
      'Hepatitis A vaccine before travel to areas with poor sanitation — two doses give protection for at least 25 years.',
      'A single dose given even two weeks before departure gives useful protection.'
    ],
    avoid: [
      'Raw or undercooked shellfish from potentially contaminated water.',
      'Untreated water, ice, and food washed in it.',
      'Food prepared by an infected handler — this is the usual outbreak mechanism in high-income countries.'
    ],
    prevention: [
      'Vaccination; post-exposure vaccine within 2 weeks also works for contacts.',
      'Handwashing with soap after the toilet and before food preparation.',
      'Exclude infected food handlers for 7 days after jaundice onset.'
    ],
    symptoms: [
      'Fever, fatigue, loss of appetite, nausea, abdominal discomfort, dark urine, then jaundice.',
      'Children under 6 usually have no jaundice and may show no symptoms while still shedding virus.'
    ],
    detection: [
      'Anti-HAV IgM serology.',
      'Raised transaminases, often dramatically so, alongside.'
    ],
    source: 'WHO — Hepatitis A fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/hepatitis-a'
  },

  'Hepatitis E': {
    aka: ['hep e', 'hev'],
    treatments: [
      'Supportive care for most people. Ribavirin is used in chronic infection in the immunosuppressed.',
      'Mortality reaches 20–25% in women infected in the third trimester of pregnancy — this is the group that matters.'
    ],
    travel: [
      'Risk concentrates in South Asia and Africa, especially in displacement camps and after flooding.',
      'A vaccine is licensed in China only; it is not available for general travel use.'
    ],
    avoid: [
      'Untreated drinking water — waterborne transmission drives the large outbreaks.',
      'Undercooked pork, game meat and shellfish, which drive sporadic cases in Europe.'
    ],
    prevention: [
      'Safe water supply and sanitation.',
      'Boiling or chlorinating drinking water in outbreak settings.',
      'Thorough cooking of pork and game.'
    ],
    symptoms: [
      'Jaundice, dark urine, pale stools, fatigue, nausea, abdominal pain — clinically like hepatitis A.'
    ],
    detection: [
      'Anti-HEV IgM serology; PCR on blood or stool where available.'
    ],
    source: 'WHO — Hepatitis E fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/hepatitis-e'
  },

  'Acute hepatitis of unknown aetiology': {
    aka: ['acute hepatitis of unknown origin', 'hepatitis of unknown aetiology', 'severe acute hepatitis unknown'],
    treatments: [
      'Supportive liver care; a minority of children have needed transplantation.',
      'Investigate and exclude hepatitis A–E, autoimmune, metabolic and toxic causes first.',
      'Adenovirus and adeno-associated virus 2 have been implicated in previous clusters but no cause is confirmed for every case.'
    ],
    travel: [
      'No travel restriction applies. Report unexplained jaundice in a child to public health promptly.'
    ],
    avoid: [
      'Nothing specific is established. Standard hand hygiene and food and water precautions apply.'
    ],
    prevention: [
      'Routine hand hygiene and respiratory etiquette, given the suspected adenovirus link.',
      'Keep hepatitis A and B vaccination up to date so those causes can be excluded quickly.'
    ],
    symptoms: [
      'Jaundice, dark urine, pale stools, vomiting, abdominal pain, usually in children under 10, often without fever.'
    ],
    detection: [
      'Markedly raised transaminases with negative hepatitis A–E serology.',
      'Adenovirus PCR on whole blood, plus a full liver panel.'
    ],
    source: 'WHO — Disease Outbreak News',
    url: 'https://www.who.int/emergencies/disease-outbreak-news'
  },

  /* ---------- water, food and sanitation ---------- */

  'Cholera': {
    aka: ['vibrio cholerae', 'acute watery diarrhoea', 'awd'],
    treatments: [
      'Oral rehydration salts resolve about 80% of cases. Volume replaced must match volume lost — this is the whole treatment.',
      'Intravenous Ringer\'s lactate for severe dehydration, then back to oral as soon as the patient can drink.',
      'Antibiotics (doxycycline, azithromycin) only for severe cases, guided by local resistance — they shorten shedding, they do not replace fluids.',
      'Zinc supplementation for children under 5.'
    ],
    travel: [
      'Oral cholera vaccine (Dukoral, Euvichol, Shanchol) for travel into active transmission, especially aid and health workers.',
      'Global OCV stockpile is under strain, so single-dose campaigns are now standard in outbreaks.',
      'Know where the nearest rehydration point is before you need it.'
    ],
    avoid: [
      'Untreated water, ice, and drinks made with either.',
      'Raw or undercooked shellfish from affected coastal waters.',
      'Food from vendors without a safe water supply or handwashing facilities.',
      'Funeral practices involving washing the body, which have seeded outbreaks repeatedly.'
    ],
    prevention: [
      'Boil it, cook it, peel it, or leave it.',
      'Chlorinate or filter drinking water; store treated water in a narrow-necked covered container.',
      'Handwashing with soap after the toilet and before eating.',
      'Safe disposal of faeces — cholera is a sanitation failure before it is a medical problem.'
    ],
    symptoms: [
      'Sudden profuse watery diarrhoea, often described as rice-water, sometimes with vomiting.',
      'No fever and no abdominal cramping in classic cases.',
      'Severe dehydration can kill within hours: sunken eyes, no urine, skin that stays pinched, weak pulse.'
    ],
    detection: [
      'Rapid dipstick test on stool for screening; stool culture confirms and gives antibiotic sensitivity.',
      'In a declared outbreak, treatment starts on clinical grounds — dehydration is managed first, testing second.'
    ],
    source: 'WHO — Cholera fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/cholera'
  },

  'Salmonellosis': {
    aka: ['salmonella', 'non-typhoidal salmonella', 'salmonella enteritidis', 'salmonella typhimurium'],
    treatments: [
      'Rehydration is the mainstay. Most healthy adults recover in 4–7 days without antibiotics.',
      'Antibiotics reserved for infants, over-50s, immunocompromised patients and anyone with invasive disease — they can prolong shedding otherwise.'
    ],
    travel: [
      'A leading cause of travellers\' diarrhoea worldwide; no vaccine for the non-typhoidal strains.'
    ],
    avoid: [
      'Raw and undercooked eggs, poultry and meat.',
      'Unpasteurised milk and juice.',
      'Cross-contamination — the same board and knife for raw chicken then salad.',
      'Handling reptiles and amphibians without washing afterward.'
    ],
    prevention: [
      'Cook poultry to 74°C throughout; no pink meat and no runny juices.',
      'Separate raw and ready-to-eat foods at every stage.',
      'Refrigerate below 5°C promptly; do not thaw at room temperature.'
    ],
    symptoms: [
      'Diarrhoea, fever and abdominal cramps 6 hours to 6 days after exposure, lasting under a week.'
    ],
    detection: [
      'Stool culture, with whole-genome sequencing used by public health to link cases into an outbreak cluster.'
    ],
    source: 'WHO — Salmonella (non-typhoidal) fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/salmonella-(non-typhoidal)'
  },

  'Listeriosis': {
    aka: ['listeria', 'listeria monocytogenes'],
    treatments: [
      'High-dose intravenous ampicillin, usually with gentamicin, for invasive disease.',
      'Prompt treatment in pregnancy can prevent fetal infection.',
      'Case fatality in invasive listeriosis is 20–30% even with treatment.'
    ],
    travel: [
      'Not a travel-restricted disease, but pregnant travellers should apply the food rules everywhere.'
    ],
    avoid: [
      'Soft cheeses made from unpasteurised milk; deli meats and pâté unless reheated to steaming.',
      'Cold smoked fish, pre-prepared salads and unwashed raw vegetables, if pregnant or immunocompromised.',
      'Ready-to-eat foods kept past their date — <em>Listeria</em> grows at refrigerator temperature, which is what makes it unusual.'
    ],
    prevention: [
      'Reheat ready-to-eat meats until steaming hot.',
      'Keep the fridge at or below 4°C and clean up spills from ready-to-eat foods.',
      'Pregnant women, over-65s and immunocompromised people should follow the restricted food list.'
    ],
    symptoms: [
      'Fever and muscle aches, sometimes with diarrhoea, up to 70 days after exposure — the long incubation makes source tracing hard.',
      'Invasive disease: meningitis or septicaemia. In pregnancy: miscarriage, stillbirth or neonatal sepsis, often with mild maternal illness.'
    ],
    detection: [
      'Blood or cerebrospinal fluid culture. Stool culture is not useful.',
      'Whole-genome sequencing links cases to a contaminated production line.'
    ],
    source: 'WHO — Listeriosis fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/listeriosis'
  },

  'Shigellosis': {
    aka: ['shigella', 'bacillary dysentery'],
    treatments: [
      'Rehydration first. Antibiotics shorten illness and transmission but resistance is now widespread — culture and sensitivity matter.',
      'Extensively drug-resistant <em>Shigella sonnei</em> is spreading internationally.',
      'Avoid anti-motility drugs like loperamide in bloody diarrhoea.'
    ],
    travel: [
      'Common in travellers to South Asia, Africa and Latin America. No vaccine.'
    ],
    avoid: [
      'Untreated water and food washed in it.',
      'Sexual practices involving faecal-oral contact during an outbreak — a major transmission route in current European and North American clusters.'
    ],
    prevention: [
      'Handwashing with soap; alcohol gel alone is less effective against <em>Shigella</em>.',
      'Exclude cases from food handling, childcare and health care until 48 hours symptom-free.',
      'Very low infectious dose — as few as 10 organisms — so hygiene has to be strict.'
    ],
    symptoms: [
      'Diarrhoea, often bloody or mucoid, with fever, cramps and painful straining, 1–3 days after exposure.'
    ],
    detection: [
      'Stool culture with antibiotic sensitivity testing; PCR panels detect it faster but do not give sensitivities.'
    ],
    source: 'CDC — Shigella',
    url: 'https://www.cdc.gov/shigella/'
  },

  'Escherichia coli O157 (STEC)': {
    aka: ['e. coli', 'e coli', 'stec', 'vtec', 'ehec', 'shiga toxin', 'o157', 'haemolytic uraemic syndrome', 'hus'],
    treatments: [
      'Rehydration and monitoring. <strong>Do not give antibiotics</strong> — they increase the risk of haemolytic uraemic syndrome.',
      'Avoid anti-motility drugs.',
      'Monitor kidney function and blood counts for two weeks after onset, especially in children under 5.'
    ],
    travel: [
      'Not travel-restricted. Outbreaks are usually traced to a food product or a farm visit rather than a destination.'
    ],
    avoid: [
      'Undercooked minced beef — burgers pink in the middle are the classic vehicle.',
      'Unpasteurised milk, cheese and apple juice.',
      'Swallowing water in lakes and paddling pools; touching farm animals without washing afterward.'
    ],
    prevention: [
      'Cook minced meat to 71°C throughout.',
      'Wash hands after any contact with farm animals or their environment — petting farms are a recurring source.',
      'Keep raw meat separate from ready-to-eat food.'
    ],
    symptoms: [
      'Severe abdominal cramps and watery diarrhoea turning bloody after 1–3 days; fever is often mild or absent.',
      'Haemolytic uraemic syndrome develops in 5–10%, usually in the second week: reduced urine, pallor, bruising.'
    ],
    detection: [
      'Stool culture on selective medium plus Shiga toxin testing or PCR.'
    ],
    source: 'WHO — E. coli fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/e-coli'
  },

  'Botulism': {
    aka: ['clostridium botulinum', 'botulinum toxin', 'infant botulism'],
    treatments: [
      'Botulinum antitoxin, given as early as possible — it stops progression but does not reverse existing paralysis.',
      'Mechanical ventilation for respiratory failure; recovery takes weeks to months.',
      'Infant botulism is treated with human-derived BabyBIG, not equine antitoxin.'
    ],
    travel: [
      'Not travel-associated in general. Outbreaks trace to a specific food product.'
    ],
    avoid: [
      'Home-canned, fermented and preserved foods with inadequate processing — bulging or leaking cans especially.',
      'Honey for infants under 12 months.',
      'Improperly stored oil infusions with garlic or herbs.'
    ],
    prevention: [
      'Pressure-can low-acid foods; boil home-canned vegetables for 10 minutes before eating.',
      'Refrigerate opened preserves and discard anything with an off smell or a swollen lid.'
    ],
    symptoms: [
      'Symmetrical descending paralysis starting with the face: double vision, drooping eyelids, slurred speech, difficulty swallowing.',
      'No fever and the patient stays alert — which distinguishes it from most causes of collapse.'
    ],
    detection: [
      'Toxin detection in serum, stool or the suspect food at a reference laboratory.',
      'Treat on clinical grounds; do not wait for the laboratory.'
    ],
    source: 'WHO — Botulism fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/botulism'
  },

  'Norovirus': {
    aka: ['norwalk', 'winter vomiting bug', 'viral gastroenteritis'],
    treatments: [
      'Rehydration only. No antiviral, no vaccine.',
      'Most people recover in 1–3 days; the risk is dehydration in the very young and very old.'
    ],
    travel: [
      'Cruise ships, hotels and conference venues are the classic settings. Report symptoms to the vessel or venue medical team.'
    ],
    avoid: [
      'Preparing food for others for 48 hours after symptoms stop — shedding continues.',
      'Raw oysters from contaminated waters.',
      'Visiting hospitals or care homes while symptomatic or within 48 hours of recovery.'
    ],
    prevention: [
      'Soap and water handwashing — alcohol gel does not reliably kill norovirus.',
      'Clean contaminated surfaces with a chlorine-based product; ordinary detergent is not enough.',
      'Wash contaminated laundry separately on a hot cycle.'
    ],
    symptoms: [
      'Sudden vomiting and watery diarrhoea with cramps, 12–48 hours after exposure.',
      'Projectile vomiting aerosolises the virus, which is why it moves through a building so fast.'
    ],
    detection: [
      'PCR on stool or vomit. Usually only done to confirm an outbreak, not for individual cases.'
    ],
    source: 'CDC — Norovirus',
    url: 'https://www.cdc.gov/norovirus/'
  },

  'Legionellosis': {
    aka: ['legionella', 'legionnaires', 'legionnaires disease', 'pontiac fever'],
    treatments: [
      'Antibiotics: a fluoroquinolone or azithromycin. Beta-lactams do not work.',
      'Case fatality around 10%, higher in hospital-acquired cases.',
      'Pontiac fever, the mild form, resolves without treatment.'
    ],
    travel: [
      'Travel-associated clusters are traced through hotel and cruise ship water systems — report a diagnosis and your accommodation history to public health.',
      'Risk rises with age over 50, smoking, and chronic lung disease.'
    ],
    avoid: [
      'Showers and spa pools that have stood unused for weeks without flushing.',
      'Standing near cooling towers and decorative fountains during an outbreak investigation.'
    ],
    prevention: [
      'Keep hot water above 50°C and cold below 20°C in building water systems.',
      'Flush unused outlets weekly; run taps and showers for several minutes after any period of vacancy.',
      'Routine cooling tower maintenance and monitoring.'
    ],
    symptoms: [
      'Fever, cough, shortness of breath, muscle aches and headache 2–10 days after exposure.',
      'Confusion and diarrhoea alongside pneumonia are suggestive.',
      'It does not spread person to person — the source is always the water system.'
    ],
    detection: [
      'Urinary antigen test detects serogroup 1 within hours; sputum culture or PCR for the rest.',
      'Culture matters for outbreak investigation because it lets the strain be matched to the water source.'
    ],
    source: 'WHO — Legionellosis fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/legionellosis'
  },

  'Leptospirosis': {
    aka: ['leptospira', 'weil disease', "weil's disease"],
    treatments: [
      'Doxycycline for mild disease; intravenous penicillin or ceftriaxone for severe.',
      'Start early — treatment is far less effective once liver and kidney failure set in.',
      'Severe disease (Weil\'s syndrome) has a case fatality above 10%.'
    ],
    travel: [
      'Outbreaks follow flooding and heavy rain, and cluster around adventure races, triathlons and rafting.',
      'Doxycycline prophylaxis is sometimes used for short high-risk exposures.'
    ],
    avoid: [
      'Wading, swimming or submerging in floodwater or fresh water contaminated by animal urine.',
      'Walking barefoot in mud or standing water after flooding, especially with cuts or grazes.'
    ],
    prevention: [
      'Waterproof footwear and covering broken skin before any contact with floodwater.',
      'Rodent control around dwellings and food stores.',
      'Shower and clean wounds promptly after freshwater exposure.'
    ],
    symptoms: [
      'Sudden fever, severe headache, muscle pain concentrated in the calves, red eyes, 5–14 days after exposure.',
      'Severe form: jaundice, kidney failure, bleeding into the lungs.'
    ],
    detection: [
      'PCR in the first week; microscopic agglutination test or IgM ELISA later.',
      'Ask about floodwater or animal exposure — that history is what triggers the test.'
    ],
    source: 'WHO — Leptospirosis',
    url: 'https://www.who.int/health-topics/leptospirosis'
  },

  'Melioidosis': {
    aka: ['burkholderia pseudomallei', 'whitmore disease'],
    treatments: [
      'Intensive phase: intravenous ceftazidime or meropenem for at least 2 weeks.',
      'Eradication phase: oral co-trimoxazole for 3–6 months. Shortening it invites relapse.',
      'Case fatality is high — 10–40% depending on health system and presentation.'
    ],
    travel: [
      'Endemic in South-East Asia, northern Australia and increasingly recognised in South Asia, Africa and the Americas.',
      'Risk rises sharply with diabetes, chronic kidney disease and heavy alcohol use.'
    ],
    avoid: [
      'Barefoot contact with soil and surface water during and after the rainy season.',
      'High-pressure water spraying and aerosol-generating soil work in endemic areas.'
    ],
    prevention: [
      'Boots and gloves for agricultural and construction work in endemic areas.',
      'Cover cuts and grazes before soil or water contact.',
      'People with diabetes should take these precautions particularly seriously.'
    ],
    symptoms: [
      'Extremely variable: pneumonia, skin abscesses, bone and joint infection, or fulminant sepsis.',
      'Can lie latent for years and reactivate — it has been called the great mimicker.'
    ],
    detection: [
      'Culture from blood, sputum, urine or abscess pus. Warn the laboratory: it is a hazard group 3 organism and is easily misidentified.'
    ],
    source: 'WHO — Melioidosis',
    url: 'https://www.who.int/news-room/fact-sheets/detail/melioidosis'
  },

  /* ---------- respiratory ---------- */

  'Influenza': {
    aka: ['seasonal influenza', 'flu', 'influenza a', 'influenza b', 'h1n1', 'h3n2', 'influenza a(h1n1)', 'influenza a(h3n2)'],
    treatments: [
      'Oseltamivir or baloxavir, most useful within 48 hours of symptom onset, prioritised for high-risk patients and anyone hospitalised.',
      'Otherwise rest, fluids and antipyretics.',
      'Antibiotics do nothing for influenza itself, but secondary bacterial pneumonia is a real complication and does need them.'
    ],
    travel: [
      'Northern hemisphere season runs roughly October–April, southern April–September, and year-round in the tropics.',
      'Vaccinate at least two weeks before travel; the composition differs between hemispheres.',
      'Crowded transport and mass gatherings are where transmission concentrates.'
    ],
    avoid: [
      'Crowded indoor spaces with poor ventilation during a peak week.',
      'Going to work or school while febrile — most transmission happens in the first 3 days.',
      'Visiting newborns, over-75s or immunocompromised people while symptomatic.'
    ],
    prevention: [
      'Annual vaccination, reformulated each year. It is the single highest-value measure.',
      'Ventilation, hand hygiene, and a well-fitted mask in crowded indoor settings during a peak.',
      'Stay home while febrile and for 24 hours after the fever resolves without medication.'
    ],
    symptoms: [
      'Abrupt fever, dry cough, headache, muscle and joint pain, sore throat, marked exhaustion.',
      'Onset is sudden — that is the main clinical clue against a common cold.'
    ],
    detection: [
      'Rapid antigen or PCR on a nose or throat swab.',
      'PCR is markedly more sensitive; rapid tests miss a meaningful share of true cases.'
    ],
    source: 'WHO — Influenza (seasonal) fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/influenza-(seasonal)'
  },

  'Influenza-like illness': {
    aka: ['ili', 'influenza like illness'],
    treatments: [
      'This is a <strong>surveillance category</strong>, not a diagnosis — fever plus cough or sore throat, cause unconfirmed.',
      'Manage as influenza until testing says otherwise: rest, fluids, antipyretics.',
      'Antivirals for high-risk patients within 48 hours of onset, without waiting for the swab result.'
    ],
    travel: [
      'A rising ILI consultation rate means respiratory viruses are circulating heavily in that country right now.',
      'It counts consultations per 100,000 people, so it reflects both illness and how readily people see a doctor — compare a country against its own past weeks, not against its neighbours.'
    ],
    avoid: [
      'Crowded, poorly ventilated indoor spaces while rates are high.',
      'Visiting hospitals and care homes with symptoms.'
    ],
    prevention: [
      'Seasonal influenza and COVID-19 vaccination.',
      'Ventilation, hand hygiene and masks in crowded settings during a peak.',
      'Stay home while febrile.'
    ],
    symptoms: [
      'Sudden fever above 38°C with cough or sore throat, and no other obvious cause.',
      'Could be influenza, RSV, SARS-CoV-2 or one of a dozen other viruses — the label does not distinguish them.'
    ],
    detection: [
      'A multiplex respiratory PCR panel identifies which virus is actually responsible.',
      'Sentinel clinics swab a fraction of ILI patients, which is how the national picture in this feed is built.'
    ],
    source: 'ECDC — ERVISS respiratory surveillance',
    url: 'https://erviss.org/'
  },

  'Acute respiratory infection': {
    aka: ['ari', 'acute respiratory illness', 'acute respiratory infections', 'sari', 'severe acute respiratory infection'],
    treatments: [
      'A <strong>surveillance category</strong> covering any acute infection of the airways, from a common cold to pneumonia.',
      'Most are viral and need only supportive care; antibiotics are for confirmed or strongly suspected bacterial infection.',
      'Warning signs needing urgent care: breathlessness at rest, chest pain, blue lips, confusion.'
    ],
    travel: [
      'A rising ARI rate marks a general respiratory season, not one specific pathogen.',
      'Countries report ARI when they do not run a separate influenza-like illness system, so the two indicators are not directly comparable.'
    ],
    avoid: [
      'Crowded indoor spaces with poor ventilation during a seasonal peak.',
      'Close contact with infants and frail older people while symptomatic.'
    ],
    prevention: [
      'Influenza, COVID-19, RSV and pneumococcal vaccination as eligible.',
      'Ventilation, hand hygiene and masks in high-transmission periods.'
    ],
    symptoms: [
      'Cough, sore throat, runny nose, fever, sometimes shortness of breath.'
    ],
    detection: [
      'Multiplex PCR panel to identify the specific virus or bacterium.',
      'Chest imaging where pneumonia is suspected.'
    ],
    source: 'ECDC / WHO respiratory surveillance',
    url: 'https://erviss.org/'
  },

  'COVID-19': {
    aka: ['sars-cov-2', 'sars cov 2', 'coronavirus disease', 'covid', 'covid19'],
    treatments: [
      'Nirmatrelvir-ritonavir (Paxlovid) or remdesivir for high-risk patients, started within 5 days of symptom onset.',
      'Dexamethasone for hospitalised patients needing oxygen.',
      'Most people need only rest, fluids and antipyretics.',
      'Check drug interactions before Paxlovid — the list is long and includes common statins and anticoagulants.'
    ],
    travel: [
      'Very few countries retain entry testing or vaccination requirements; check the destination\'s current rules rather than assuming.',
      'Carry masks for crowded transport if you are high-risk.',
      'Boosters are recommended ahead of travel for over-65s and immunocompromised travellers.'
    ],
    avoid: [
      'Crowded, poorly ventilated indoor spaces during a local wave.',
      'Visiting hospitals and care homes while symptomatic.'
    ],
    prevention: [
      'Updated vaccine matched to circulating variants, prioritised for over-65s, pregnant women and the immunocompromised.',
      'Ventilation and air filtration indoors.',
      'A well-fitted respirator (FFP2/N95) in high-risk settings.'
    ],
    symptoms: [
      'Fever, cough, sore throat, fatigue, headache, muscle pain; loss of smell is much less common with recent variants.',
      'Seek urgent care for difficulty breathing, chest pain or confusion.'
    ],
    detection: [
      'Rapid antigen test — repeat after 48 hours if negative and symptoms persist.',
      'PCR is more sensitive and is the standard for hospital admission.'
    ],
    source: 'WHO — Coronavirus disease (COVID-19)',
    url: 'https://www.who.int/health-topics/coronavirus'
  },

  'Avian influenza A(H5N1)': {
    aka: ['h5n1', 'h5n5', 'h5n6', 'h5n2', 'h7n9', 'h9n2', 'h10n3', 'h3n8', 'avian influenza', 'bird flu',
          'highly pathogenic avian influenza', 'hpai', 'influenza a(h5', 'influenza a (h5', 'zoonotic influenza'],
    treatments: [
      'Oseltamivir as early as possible, at a higher dose and for longer than for seasonal flu.',
      'Intensive care support — human H5N1 case fatality has historically been around 50%, though recent dairy-cattle-linked cases in the US have been mild.',
      'Contacts are offered antiviral prophylaxis and monitored for 10 days.'
    ],
    travel: [
      'No general travel restrictions. Avoid live bird and poultry markets and farms in affected areas.',
      'Seasonal influenza vaccination does not protect against H5N1, but it reduces the chance of co-infection and reassortment.',
      'Report any fever or conjunctivitis after bird or cattle contact and mention the exposure explicitly.'
    ],
    avoid: [
      'Live animal markets, poultry farms and backyard flocks in affected areas.',
      'Touching sick or dead birds, and raw poultry or unpasteurised milk from affected herds.',
      'Raw milk in particular — H5N1 concentrates in the milk of infected dairy cattle.'
    ],
    prevention: [
      'Cook poultry and eggs thoroughly; the virus does not survive proper cooking.',
      'Drink only pasteurised milk.',
      'PPE for cullers, farm and dairy workers: respirator, eye protection, gloves, coveralls.',
      'Hand hygiene after any animal contact.'
    ],
    symptoms: [
      'Fever, cough and sore throat, sometimes progressing rapidly to pneumonia and respiratory failure.',
      'Conjunctivitis alone has been the most common presentation in the recent US dairy worker cases.'
    ],
    detection: [
      'Subtype-specific PCR at a reference laboratory — a standard influenza A test will flag it as unsubtypeable, which is itself the warning sign.',
      'Tell the laboratory about the animal exposure so the sample is routed correctly.'
    ],
    source: 'WHO — Avian influenza',
    url: 'https://www.who.int/health-topics/influenza-avian-and-other-zoonotic'
  },

  'Middle East respiratory syndrome': {
    aka: ['mers', 'mers-cov', 'merscov', 'middle east respiratory syndrome coronavirus'],
    treatments: [
      'No proven antiviral and no licensed vaccine. Supportive intensive care.',
      'Case fatality is roughly 35%.',
      'Strict infection control — most large clusters have been amplified inside hospitals.'
    ],
    travel: [
      'Risk is concentrated in the Arabian Peninsula.',
      'Report fever with cough within 14 days of travel there, and mention any camel or hospital contact.'
    ],
    avoid: [
      'Contact with camels, camel products and camel racing or market facilities.',
      'Raw camel milk and undercooked camel meat.',
      'Unprotected contact with severely ill patients in affected hospitals.'
    ],
    prevention: [
      'Hand hygiene after animal contact; avoid touching sick animals.',
      'Full airborne precautions for health workers caring for suspected cases.',
      'Prompt isolation of suspected cases on arrival at a facility.'
    ],
    symptoms: [
      'Fever, cough, shortness of breath, sometimes with diarrhoea, progressing to pneumonia.',
      'Some infections are mild or silent, particularly in camel workers.'
    ],
    detection: [
      'RT-PCR on lower respiratory tract specimens — sputum or aspirate is far more sensitive than a nose swab.'
    ],
    source: 'WHO — MERS fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/middle-east-respiratory-syndrome-coronavirus-(mers-cov)'
  },

  'Respiratory syncytial virus': {
    aka: ['rsv', 'bronchiolitis'],
    treatments: [
      'Supportive care: oxygen, feeding support and suctioning for infants.',
      'Ribavirin is rarely used; bronchodilators and steroids do not help typical bronchiolitis.',
      'Nirsevimab, a long-acting antibody, protects infants through their first season.'
    ],
    travel: [
      'Seasonal, tracking the winter respiratory season in temperate countries and the rainy season in the tropics.',
      'Vaccines are available for over-60s and for pregnant women, which protects the newborn.'
    ],
    avoid: [
      'Taking newborns into crowded indoor spaces during peak season.',
      'Contact between anyone with a cold and an infant under 6 months or a frail older adult.',
      'Smoking around infants — it substantially worsens bronchiolitis.'
    ],
    prevention: [
      'Maternal RSV vaccination in late pregnancy, or nirsevimab for the infant.',
      'RSV vaccination for older adults per national schedule.',
      'Handwashing and surface cleaning — RSV survives for hours on hard surfaces.'
    ],
    symptoms: [
      'Runny nose and cough, progressing in infants to wheeze, rapid breathing, chest indrawing and poor feeding.',
      'In older adults it looks like a bad chest infection and is frequently misattributed to influenza.'
    ],
    detection: [
      'PCR or antigen test on a nasopharyngeal swab.'
    ],
    source: 'WHO — Respiratory syncytial virus',
    url: 'https://www.who.int/news-room/fact-sheets/detail/respiratory-syncytial-virus-(rsv)'
  },

  'Tuberculosis': {
    aka: ['tb', 'mycobacterium tuberculosis', 'mdr-tb', 'xdr-tb', 'drug-resistant tuberculosis'],
    treatments: [
      'Drug-susceptible TB: 6 months of combination therapy — isoniazid, rifampicin, pyrazinamide, ethambutol.',
      'Multidrug-resistant TB: 6-month all-oral BPaLM regimen (bedaquiline, pretomanid, linezolid, moxifloxacin) where eligible.',
      'Completing the full course is what prevents resistance. Stopping early is how MDR-TB is created.'
    ],
    travel: [
      'Long stays in high-incidence countries warrant a pre- and post-travel test, particularly for health workers.',
      'BCG protects children against severe TB but is unreliable against adult pulmonary disease.'
    ],
    avoid: [
      'Prolonged time in crowded, poorly ventilated indoor spaces with an untreated infectious case.',
      'Unpasteurised dairy in areas with bovine TB.'
    ],
    prevention: [
      'Preventive therapy for household contacts and people living with HIV.',
      'Ventilation and UV germicidal irradiation in health facilities.',
      'A case on effective treatment usually stops being infectious within about two weeks.'
    ],
    symptoms: [
      'Cough lasting more than 2–3 weeks, sometimes with blood, plus night sweats, fever and weight loss.',
      'Onset is slow, which is why diagnosis is often delayed by months.'
    ],
    detection: [
      'Rapid molecular test (Xpert MTB/RIF) on sputum — result in under 2 hours, and it detects rifampicin resistance at the same time.',
      'Chest X-ray for screening; culture remains the reference standard.'
    ],
    source: 'WHO — Tuberculosis fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/tuberculosis'
  },

  'Scarlet fever (Group A Streptococcus)': {
    aka: ['scarlet fever', 'group a streptococcus', 'igas', 'invasive group a strep', 'strep a', 'streptococcus pyogenes'],
    treatments: [
      'Penicillin or amoxicillin for 10 days; a macrolide if penicillin-allergic. Resistance to penicillin has never been documented.',
      'Invasive disease needs urgent intravenous antibiotics and sometimes surgery.',
      'Treatment prevents rheumatic fever, which is the reason a mild sore throat gets antibiotics at all.'
    ],
    travel: [
      'No travel restrictions. Outbreaks are seasonal and school-based.'
    ],
    avoid: [
      'School and nursery attendance until 24 hours of antibiotics have been taken.',
      'Sharing cups, cutlery and towels within a household case.'
    ],
    prevention: [
      'No vaccine. Hand hygiene, respiratory etiquette and prompt treatment of cases.',
      'Watch children with chickenpox closely — it is a major risk factor for invasive strep A.'
    ],
    symptoms: [
      'Sore throat and fever, then a fine sandpaper-textured rash starting on the chest, with a strawberry tongue and flushed cheeks.',
      'Invasive disease: high fever with severe muscle pain, and rapidly worsening pain out of proportion to the visible wound.'
    ],
    detection: [
      'Rapid antigen detection test or throat culture.',
      'Blood culture where invasive disease is suspected.'
    ],
    source: 'UKHSA / WHO — Group A streptococcal disease',
    url: 'https://www.who.int/emergencies/disease-outbreak-news'
  },

  /* ---------- viral haemorrhagic fevers and high-consequence ---------- */

  'Ebola': {
    aka: ['ebola virus disease', 'evd', 'zaire ebolavirus', 'ebolavirus', 'filovirus'],
    treatments: [
      'Two monoclonal antibody treatments — Inmazeb (REGN-EB3) and Ebanga (mAb114) — are approved and work best when started early.',
      'Both are specific to <em>Zaire ebolavirus</em>; they are not expected to help against the Sudan or Bundibugyo species.',
      'Aggressive supportive care — fluid and electrolyte management — remains the backbone and substantially cuts mortality on its own.'
    ],
    travel: [
      'WHO advises against general travel or trade restrictions; exit screening at affected airports is the standard measure.',
      'Ervebo vaccine is used for ring vaccination of contacts and for frontline workers, not for ordinary travellers.',
      'If you develop fever within 21 days of leaving an affected area, call ahead before attending any clinic.'
    ],
    avoid: [
      'Funeral and burial practices involving washing or touching the body — historically the single largest amplifier.',
      'Bushmeat hunting, handling and preparation.',
      'Unprotected care of a sick household member.',
      'Contact with body fluids of survivors, including semen, for months after recovery.'
    ],
    prevention: [
      'Report fever with a contact history immediately — early isolation is what ends chains of transmission.',
      'Handwashing with soap or 0.05% chlorine solution.',
      'Health workers: full PPE with a buddy-checked doffing procedure. Doffing is where infections happen.',
      'Safe and dignified burial teams.'
    ],
    symptoms: [
      'Sudden fever, severe fatigue, muscle pain, headache and sore throat 2–21 days after exposure.',
      'Then vomiting, diarrhoea, rash, impaired kidney and liver function; bleeding in some patients.'
    ],
    detection: [
      'RT-PCR on blood; a test can be negative in the first 3 days of symptoms and must be repeated.',
      'Rapid antigen tests are used for triage in outbreak settings.'
    ],
    source: 'WHO — Ebola virus disease fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/ebola-virus-disease'
  },

  'Ebola (Bundibugyo virus)': {
    aka: ['bundibugyo', 'bundibugyo ebolavirus', 'bundibugyo virus'],
    treatments: [
      '<strong>Ervebo (rVSV-ZEBOV)</strong> is licensed against <em>Zaire ebolavirus</em> and is <em>not</em> expected to protect against Bundibugyo.',
      '<strong>Inmazeb and Ebanga</strong> are likewise Zaire-specific; efficacy against Bundibugyo is unestablished.',
      'Supportive care — aggressive fluid and electrolyte management — is therefore the mainstay for this species.',
      'Historical case fatality for Bundibugyo is around 25–40%, lower than Zaire but still severe.'
    ],
    travel: [
      'WHO and Africa CDC both advise against travel and trade restrictions; enhanced screening is used instead.',
      'Exit screening operates at affected border points and airports.',
      'Fever within 21 days of leaving the affected area: call ahead, do not walk into a clinic.'
    ],
    avoid: [
      'Funeral and burial practices involving contact with the body.',
      'Bushmeat handling and preparation.',
      'Unprotected care of a sick household member.'
    ],
    prevention: [
      'Report fever with a recent contact history immediately.',
      'Handwashing with soap or chlorine solution.',
      'Health workers: full PPE plus buddy-checked doffing.',
      'Contact tracing with 21-day follow-up.'
    ],
    symptoms: [
      'Same as other ebolaviruses: sudden fever, weakness, muscle pain, headache, sore throat, then vomiting, diarrhoea and organ dysfunction.'
    ],
    detection: [
      'Species-specific RT-PCR — a generic filovirus assay will not distinguish Bundibugyo from Zaire, and the distinction changes what treatment is worth giving.'
    ],
    source: 'WHO — Ebola virus disease fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/ebola-virus-disease'
  },

  'Sudan virus disease': {
    aka: ['sudan ebolavirus', 'sudan virus', 'svd'],
    treatments: [
      'No licensed vaccine or therapeutic. Ervebo, Inmazeb and Ebanga all target <em>Zaire ebolavirus</em> and are not expected to work.',
      'Candidate vaccines exist and have been deployed under trial protocols during outbreaks.',
      'Supportive care — fluids, electrolytes, organ support — is the mainstay. Case fatality has ranged 41–70%.'
    ],
    travel: [
      'WHO advises against travel or trade restrictions; screening at exit points instead.',
      'Fever within 21 days of leaving an affected area: call ahead before attending a clinic.'
    ],
    avoid: [
      'Funeral practices involving contact with the body.',
      'Bushmeat handling.',
      'Unprotected care of a symptomatic household member.'
    ],
    prevention: [
      'Immediate isolation and contact tracing with 21-day follow-up.',
      'Full PPE and supervised doffing for health workers.',
      'Safe and dignified burials.'
    ],
    symptoms: [
      'Indistinguishable clinically from other ebolaviruses: fever, weakness, muscle pain, then gastrointestinal loss and organ failure.'
    ],
    detection: [
      'Species-specific RT-PCR. Because no approved therapeutic covers this species, species identification changes the entire response.'
    ],
    source: 'WHO — Ebola virus disease fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/ebola-virus-disease'
  },

  'Marburg virus disease': {
    aka: ['marburg', 'marburg virus', 'mvd'],
    treatments: [
      'No licensed vaccine or antiviral. Candidate vaccines have been deployed under trial protocols during recent outbreaks.',
      'Supportive care: fluid and electrolyte replacement, oxygen, blood products.',
      'Case fatality has ranged from 24% to 88% across outbreaks.'
    ],
    travel: [
      'WHO advises against travel and trade restrictions; exit screening instead.',
      'Avoid caves and mines inhabited by Egyptian rousette fruit bats, the reservoir.',
      'Fever within 21 days of leaving an affected area: call ahead.'
    ],
    avoid: [
      'Caves and mines with bat colonies.',
      'Funeral practices involving contact with the body.',
      'Unprotected care of a sick person; contact with survivors\' body fluids for months after recovery.'
    ],
    prevention: [
      'Isolation of suspected cases and 21-day contact follow-up.',
      'Full PPE with supervised doffing.',
      'Safe and dignified burial.'
    ],
    symptoms: [
      'Abrupt severe headache and malaise, high fever, then watery diarrhoea, cramping and vomiting from about day 3.',
      'Patients have been described as developing ghost-like drawn features with deep-set eyes; bleeding from day 5–7 in severe cases.'
    ],
    detection: [
      'RT-PCR on blood at a high-containment reference laboratory.',
      'Handle samples as hazard group 4.'
    ],
    source: 'WHO — Marburg virus disease fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/marburg-virus-disease'
  },

  'Lassa fever': {
    aka: ['lassa', 'lassa virus', 'arenavirus'],
    treatments: [
      'Ribavirin is used and is most likely to help when started in the first six days, though the evidence base is weaker than often assumed.',
      'Supportive care with fluid, electrolyte and blood pressure management.',
      'Overall case fatality is about 1%, but around 15% among hospitalised patients.',
      'Deafness follows in roughly a quarter of survivors and is often permanent.'
    ],
    travel: [
      'Endemic in Nigeria, Sierra Leone, Liberia, Guinea, Benin, Ghana, Mali and Togo, with a dry-season peak from December to April.',
      'No vaccine. Prevention is rodent control.',
      'Report fever within 21 days of return from an endemic area.'
    ],
    avoid: [
      'Food stored where rodents can reach it, and food dried in the open.',
      'Sweeping dry rodent droppings, which aerosolises the virus.',
      'Catching and eating <em>Mastomys</em> rats.'
    ],
    prevention: [
      'Store food in sealed rodent-proof containers.',
      'Keep homes clean and rodent-free; keep cats.',
      'Damp-wipe rather than sweep areas with rodent droppings.',
      'Standard infection control in health facilities — nosocomial spread is well documented.'
    ],
    symptoms: [
      'About 80% of infections are mild or silent.',
      'Severe: fever, weakness, sore throat, muscle pain, chest and abdominal pain, then facial swelling, bleeding and shock.'
    ],
    detection: [
      'RT-PCR on blood at a reference laboratory; antigen and IgM ELISA also used.',
      'Suspicion rests on fever plus endemic-area exposure that has not responded to antimalarials and antibiotics.'
    ],
    source: 'WHO — Lassa fever fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/lassa-fever'
  },

  'Nipah virus infection': {
    aka: ['nipah', 'niv', 'nipah virus'],
    treatments: [
      'No licensed treatment or vaccine. Intensive supportive care.',
      'Monoclonal antibody m102.4 has been used compassionately; ribavirin has been tried with unclear benefit.',
      'Case fatality ranges 40–75%. Survivors may have lasting neurological damage or late-onset encephalitis.'
    ],
    travel: [
      'Outbreaks recur in Bangladesh and Kerala, India, with a winter date-palm sap season in Bangladesh.',
      'No vaccine; avoidance of the specific exposures below is the whole strategy.'
    ],
    avoid: [
      'Raw date palm sap and toddy — bats contaminate the collection pots overnight.',
      'Fruit that is partly eaten or found on the ground under bat roosts.',
      'Unprotected contact with sick pigs, and with a symptomatic patient — person-to-person transmission is well established.'
    ],
    prevention: [
      'Boil date palm sap before drinking; use skirts on collection pots.',
      'Wash and peel fruit before eating.',
      'Full PPE and strict isolation for suspected cases; this is a high-consequence pathogen in hospitals.'
    ],
    symptoms: [
      'Fever, headache, muscle pain, vomiting and sore throat, then dizziness, drowsiness and encephalitis within days.',
      'Some patients develop atypical pneumonia and acute respiratory distress.'
    ],
    detection: [
      'RT-PCR on throat swab, cerebrospinal fluid, urine or blood in the acute phase; ELISA later.',
      'Requires a high-containment laboratory.'
    ],
    source: 'WHO — Nipah virus fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/nipah-virus'
  },

  'Hantavirus': {
    aka: ['hantavirus pulmonary syndrome', 'hps', 'hfrs', 'haemorrhagic fever with renal syndrome', 'sin nombre', 'seoul virus'],
    treatments: [
      'No specific antiviral or vaccine in most countries. Supportive intensive care.',
      'Hantavirus pulmonary syndrome needs early transfer to a centre with extracorporeal support — mortality is around 35–40%.',
      'Haemorrhagic fever with renal syndrome may need dialysis.'
    ],
    travel: [
      'Present in the Americas (pulmonary form) and Eurasia (renal form).',
      'Risk is tied to rodent-infested rural buildings rather than to cities.'
    ],
    avoid: [
      'Sweeping or vacuuming rodent droppings and nests — that is what aerosolises the virus.',
      'Sleeping in long-closed cabins, sheds and barns without airing them first.'
    ],
    prevention: [
      'Air out closed buildings for 30 minutes before entering.',
      'Wet the area with disinfectant, then wipe — never sweep dry.',
      'Gloves and an N95 respirator for any rodent clean-up; seal entry holes.'
    ],
    symptoms: [
      'Fever, severe muscle aches and fatigue for 3–5 days, then abrupt shortness of breath as the lungs fill (pulmonary form).',
      'Renal form: fever, back pain, then reduced urine output and bleeding tendency.'
    ],
    detection: [
      'IgM serology; PCR early in illness.',
      'A low platelet count with a rising haematocrit and rapidly worsening breathlessness is the classic pattern.'
    ],
    source: 'CDC — Hantavirus',
    url: 'https://www.cdc.gov/hantavirus/'
  },

  'Mpox': {
    aka: ['monkeypox', 'mpxv', 'clade i', 'clade ib', 'clade ii', 'mpox clade i'],
    treatments: [
      'Mostly supportive: pain control, wound care, and treatment of secondary bacterial infection.',
      'Tecovirimat is available under trial and expanded-access protocols; the PALM007 trial did not show it shortened lesion healing in clade I disease.',
      'Severe disease is concentrated in people with advanced HIV, young children and pregnant women.',
      'Eye involvement needs urgent ophthalmology review.'
    ],
    travel: [
      'MVA-BN (Jynneos/Imvanex) is offered pre-exposure to people at higher risk and to health and outbreak workers.',
      'No general travel restrictions. Clade I transmission is concentrated in Central and East Africa.',
      'Post-exposure vaccination within 4 days of contact can prevent disease.'
    ],
    avoid: [
      'Close skin-to-skin and sexual contact with anyone who has an unexplained rash.',
      'Sharing bedding, towels and clothing with a case.',
      'Contact with wild rodents and primates, and with bushmeat, in endemic areas.'
    ],
    prevention: [
      'Vaccination for those eligible — two doses, 28 days apart.',
      'Isolate cases until every lesion has crusted, the scabs have fallen off and fresh skin has formed.',
      'Cover lesions and wear a mask around others while infectious.',
      'Hand hygiene and hot-wash contaminated laundry without shaking it out.'
    ],
    symptoms: [
      'Fever, headache, muscle pain, and characteristically swollen lymph nodes, followed by a rash that progresses through flat, raised, blistered and pustular stages.',
      'In the current outbreaks the rash often starts in the genital or perianal area and may be the only sign.'
    ],
    detection: [
      'PCR on a swab of lesion fluid or the crust — swab firmly, the surface fluid is the sample.',
      'Clade-specific PCR distinguishes clade I from clade II, which matters for the public health response.'
    ],
    source: 'WHO — Mpox fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/mpox'
  },

  'Rabies': {
    aka: ['rabies virus', 'lyssavirus', 'hydrophobia'],
    treatments: [
      '<strong>Post-exposure prophylaxis works, and once symptoms begin the disease is essentially always fatal.</strong> There is no window for delay.',
      'Wash the wound with soap and running water for 15 minutes immediately — this alone substantially cuts risk.',
      'Then vaccine, plus rabies immunoglobulin infiltrated into the wound for previously unvaccinated people.',
      'Start PEP the same day. There is no time limit that makes it "too late" to begin if symptoms have not started.'
    ],
    travel: [
      'Pre-exposure vaccination for travel to endemic areas with limited medical access, and for anyone working with animals.',
      'Pre-exposure vaccination simplifies but does not remove the need for post-exposure doses.',
      'Know before you go where rabies immunoglobulin is actually available — in much of the world it is not.'
    ],
    avoid: [
      'Petting, feeding or handling stray dogs, cats and monkeys.',
      'Approaching bats or picking up a grounded bat.',
      'Waiting to "see what happens" after a bite, scratch or lick on broken skin.'
    ],
    prevention: [
      'Dog vaccination is the intervention that eliminates human rabies — 99% of human cases come from dog bites.',
      'Wound washing plus prompt PEP.',
      'Teach children to report every animal contact, however minor it looks.'
    ],
    symptoms: [
      'Tingling or pain at the healed bite site, then fever, anxiety and confusion.',
      'Furious form: hyperactivity, hallucinations, fear of water and of moving air.',
      'Paralytic form: gradual weakness from the bite site outward, often misdiagnosed.'
    ],
    detection: [
      'No reliable test before symptoms appear — which is why PEP is given on exposure history, not on testing.',
      'Post-symptom: PCR on saliva, skin biopsy from the nape of the neck, or cerebrospinal fluid.'
    ],
    source: 'WHO — Rabies fact sheet',
    url: 'https://www.who.int/news-room/fact-sheets/detail/rabies'
  },

  'Anthrax': {
    aka: ['bacillus anthracis', 'cutaneous anthrax', 'inhalational anthrax'],
    treatments: [
      'Ciprofloxacin or doxycycline, with additional agents and antitoxin for systemic disease.',
      'Cutaneous anthrax treated early has under 1% mortality; inhalational anthrax kills most patients even with treatment.',
      'Post-exposure prophylaxis: 60 days of antibiotics plus vaccine for confirmed exposure.'
    ],
    travel: [
      'Risk is occupational and rural — livestock keepers, butchers, hide and wool workers.',
      'Outbreaks follow drought and livestock die-offs.'
    ],
    avoid: [
      'Butchering or eating animals that died of unknown causes — this is the source of nearly every human outbreak.',
      'Handling hides, wool and bone meal from affected areas without protection.'
    ],
    prevention: [
      'Livestock vaccination and safe carcass disposal by burning or deep burial.',
      'Never open the carcass of an animal suspected to have died of anthrax — exposure to air is what forms spores.',
      'Gloves and protective clothing for occupational exposure.'
    ],
    symptoms: [
      'Cutaneous: a painless itchy bump becoming an ulcer with a black centre, with surrounding swelling.',
      'Gastrointestinal: fever, severe abdominal pain, bloody diarrhoea after eating contaminated meat.',
      'Inhalational: flu-like illness for a few days, then sudden severe breathlessness and shock.'
    ],
    detection: [
      'Culture or PCR from a lesion swab, blood or pleural fluid. Warn the laboratory — it is a hazard group 3 organism.'
    ],
    source: 'WHO — Anthrax',
    url: 'https://www.who.int/news-room/fact-sheets/detail/anthrax'
  }
};

/* ---------------------------------------------------------------------------
   2. THE FALLBACK

   Shown only when both the library and the auto-resolver come up empty, which
   should be rare. It still gives the user somewhere to go.
   --------------------------------------------------------------------------- */

const FALLBACK = {
  treatments: [
    'No curated guidance is loaded for this disease yet, and the automatic lookup did not return one.',
    'Check the source bulletin linked in the panel above for clinical guidance specific to this outbreak.'
  ],
  travel: [
    'Check the CDC travel notices and the WHO regional advisory for this country before travelling.'
  ],
  avoid: [
    'Follow the precautions in the source bulletin — they are outbreak-specific and more reliable than general advice.'
  ],
  prevention: [
    'Follow national public-health guidance for this outbreak.'
  ],
  symptoms: ['Not loaded. See the source bulletin.'],
  detection: ['Not loaded. See the source bulletin.'],
  source: 'WHO — Disease Outbreak News',
  url: 'https://www.who.int/emergencies/disease-outbreak-news'
};

/* ---------------------------------------------------------------------------
   3. THE RESOLVER

   The scrapers do not produce clean names. WHO writes bulletin titles like
   "Circulating vaccine-derived poliovirus type 2 (cVDPV2)" and
   "Middle East respiratory syndrome coronavirus". Africa CDC writes "Mpox".
   NICD writes "Measles". They all have to land on the same entries.

   Strategy: build one index of every canonical name and every alias, then
   match the LONGEST alias that appears as a whole phrase inside the incoming
   name. Longest-first is what stops "Influenza-like illness" collapsing into
   "Influenza", and stops "Ebola (Bundibugyo virus)" collapsing into "Ebola".
   --------------------------------------------------------------------------- */

function norm(s){
  return ' ' + String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^a-z0-9\-.' ]/g, ' ')      // parentheses become spaces, so
                                          // "Influenza A(H5N5)" -> "influenza a h5n5"
    .replace(/\s+/g, ' ')
    .trim() + ' ';
}

const INDEX = [];   // [{ needle, key }] sorted longest needle first
for(const [key, entry] of Object.entries(LIBRARY)){
  INDEX.push({ needle: norm(key).trim(), key });
  for(const a of (entry.aka || [])) INDEX.push({ needle: norm(a).trim(), key });
}
INDEX.sort((a, b) => b.needle.length - a.needle.length);

/* Whole-phrase containment. Word boundaries stop "je" matching inside
   "jaundice" and "tb" matching inside "outbreak". */
function contains(hay, needle){
  const safe = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^| )' + safe + '($| )').test(hay);
}

/**
 * Resolve a raw disease name onto a library key.
 * Returns { key, entry, exact } or null.
 */
/* A few cases where longest-alias matching gives the wrong answer, because a
   short, specific token should beat a long, generic one. "Influenza A(H5N5)"
   contains "influenza" (9 characters) and "h5n5" (4), and the short one is the
   one that matters. These are checked first. */
const RULES = [
  // H5, H7, H9, H10 and H3N8 are avian subtypes. H1N1 and H3N2 are seasonal
  // human flu and correctly fall through to the Influenza entry.
  { re: /\b(h(5|7|9)n\d|h10n\d|h3n8)\b/, key: 'Avian influenza A(H5N1)' },
  { re: /\bsars-?cov-?2\b/,              key: 'COVID-19' },
  { re: /\bcvdpv\d?\b|vaccine.derived poliovirus/, key: 'Polio' }
];

export function resolve(name){
  const hay = norm(name);

  for(const { re, key } of RULES){
    if(re.test(hay)) return { key, entry: LIBRARY[key], exact: norm(key) === hay };
  }

  for(const { needle, key } of INDEX){
    if(contains(hay, needle)){
      return { key, entry: LIBRARY[key], exact: norm(key) === hay };
    }
  }
  return null;
}

export function libraryKeys(){ return Object.keys(LIBRARY); }

/* ---------------------------------------------------------------------------
   4. THE AUTO-RESOLVER

   When a disease name matches nothing above — a genuinely new WHO bulletin,
   an unfamiliar pathogen — this builds an entry from the public encyclopaedia
   article, which is CC-licensed, has no API key and no rate limit that a
   student project will hit.

   It reads the article as plain text with its section headings intact, then
   maps sections onto the four drawer tabs:

       Treatment / Management        -> treatments
       Prevention / Vaccine          -> prevention
       Transmission / Cause / Risk   -> avoid
       Signs and symptoms            -> symptoms
       Diagnosis                     -> detection

   The travel tab has no encyclopaedia equivalent, so it is generated as a
   pointer to the CDC and WHO pages for that disease. Everything produced here
   is tagged auto:true and the interface labels it as unverified.
   --------------------------------------------------------------------------- */

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const UA = 'PandemicTracker/1.0 (student project; contact: YOUR_EMAIL_HERE)';

const autoCache = new Map();   // disease name -> entry | null

async function getJSON(url, ms = 5000){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try{
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: ctrl.signal });
    if(!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/* Split plain text into sentences without breaking on "e.g." or "P. falciparum". */
function sentences(text){
  return String(text)
    .replace(/\s+/g, ' ')
    .replace(/\[\d+\]/g, '')                       // strip footnote markers
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map(s => s.trim())
    .filter(s => s.length > 40 && s.length < 320);
}

/* The plain-text extract keeps headings as "== Treatment ==". Turn the whole
   article into { headingLowercased: bodyText }. */
function sectionise(extract){
  const out = {};
  let current = 'intro';
  out[current] = '';
  for(const line of String(extract).split('\n')){
    const h = line.match(/^\s*(={2,6})\s*(.+?)\s*\1\s*$/);
    if(h){ current = h[2].toLowerCase().trim(); out[current] = ''; }
    else { out[current] = (out[current] || '') + ' ' + line; }
  }
  return out;
}

function pickSection(sections, candidates, limit = 3){
  for(const want of candidates){
    for(const [heading, body] of Object.entries(sections)){
      if(heading === want || heading.startsWith(want + ' ') || heading.includes(want)){
        const s = sentences(body);
        if(s.length) return s.slice(0, limit);
      }
    }
  }
  return [];
}

async function findArticle(name){
  const q = encodeURIComponent(name + ' disease');
  const url = `${WIKI_API}?action=query&list=search&srsearch=${q}&srlimit=1&format=json&origin=*`;
  const j = await getJSON(url);
  const hit = j?.query?.search?.[0];
  return hit ? hit.title : null;
}

async function readArticle(title){
  const url = `${WIKI_API}?action=query&prop=extracts&explaintext=1&redirects=1`
            + `&titles=${encodeURIComponent(title)}&format=json&origin=*`;
  const j = await getJSON(url, 7000);
  const pages = j?.query?.pages || {};
  const first = Object.values(pages)[0];
  return first?.extract || null;
}

/**
 * Build a drawer entry for a disease nobody has written one for.
 * Returns an entry object, or null if the lookup produced nothing usable.
 */
export async function autoFetch(name){
  if(autoCache.has(name)) return autoCache.get(name);

  let entry = null;
  try{
    const title = await findArticle(name);
    if(title){
      const extract = await readArticle(title);
      if(extract){
        const sec = sectionise(extract);

        const treatments = pickSection(sec, ['treatment', 'management', 'therapy', 'medication']);
        const prevention = pickSection(sec, ['prevention', 'vaccine', 'vaccination', 'prophylaxis', 'control']);
        const avoid      = pickSection(sec, ['transmission', 'cause', 'risk factor', 'spread', 'epidemiology'], 2);
        const symptoms   = pickSection(sec, ['signs and symptoms', 'symptoms', 'presentation', 'clinical']);
        const detection  = pickSection(sec, ['diagnosis', 'diagnostic', 'screening', 'testing']);
        const intro      = sentences(sec.intro || '').slice(0, 2);

        // Only accept the result if at least two tabs came back with content.
        const filled = [treatments, prevention, avoid].filter(a => a.length).length;
        if(filled >= 2 || (treatments.length && intro.length)){
          const wikiUrl = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_'));
          const cdcSearch = 'https://search.cdc.gov/search/?query=' + encodeURIComponent(name);
          const whoSearch = 'https://www.who.int/home/search?indexCatalogue=genericsearchindex1&searchQuery='
                          + encodeURIComponent(name);

          entry = {
            auto: true,
            treatments: treatments.length ? treatments
                      : ['No treatment section was found in the automatic lookup. Use the source bulletin.'],
            travel: [
              `No travel guidance is published for this disease yet — it is new to this pipeline.`,
              `Check the <a href="${cdcSearch}" target="_blank" rel="noopener">CDC notices</a> and the `
                + `<a href="${whoSearch}" target="_blank" rel="noopener">WHO advisory</a> for this disease before travelling.`,
              'Treat the case count in the panel above as the current picture and the source bulletin as authoritative.'
            ],
            avoid: avoid.length ? avoid.map(s => 'Known route of spread: ' + s)
                 : ['Transmission route not established by the automatic lookup. Follow the source bulletin.'],
            prevention: prevention.length ? prevention
                      : (intro.length ? intro : ['No prevention section was found in the automatic lookup.']),
            symptoms: symptoms.length ? symptoms : intro,
            detection: detection.length ? detection
                     : ['No diagnostic section was found. Contact the national reference laboratory.'],
            source: 'Auto-compiled from public reference sources — unverified',
            url: wikiUrl
          };
        }
      }
    }
  } catch (err) {
    entry = null;   // swallow: a failed lookup must never break the endpoint
  }

  autoCache.set(name, entry);
  return entry;
}

/* ---------------------------------------------------------------------------
   5. THE ENTRY POINT

   Called once per /api/outbreaks request with every disease name that appears
   anywhere in the response. Returns a guidance object keyed by the EXACT names
   the front end will look up, so the browser never has to do any matching.

   Budgeting: only unknown names hit the network, they go in parallel, they are
   capped per request, and results are cached in module scope so a warm lambda
   never looks the same disease up twice.
   --------------------------------------------------------------------------- */

const AUTO_LIMIT = 8;   // network lookups per request

export async function buildGuidance(names){
  const wanted = [...new Set((names || []).filter(Boolean))];
  const out = {};
  const notes = [];
  const unknown = [];

  let matched = 0, aliased = 0;

  for(const name of wanted){
    const hit = resolve(name);
    if(hit){
      matched++;
      out[name] = hit.exact
        ? hit.entry
        : { ...hit.entry, appliedFrom: hit.key };   // "showing Ebola guidance for Ebola (Bundibugyo virus)"
      if(!hit.exact) aliased++;
    } else {
      unknown.push(name);
    }
  }

  // Anything the library has never seen gets looked up, in parallel.
  const toFetch = unknown.slice(0, AUTO_LIMIT);
  const results = await Promise.allSettled(toFetch.map(n => autoFetch(n)));

  let auto = 0, failed = [];
  results.forEach((r, i) => {
    const name = toFetch[i];
    if(r.status === 'fulfilled' && r.value){ out[name] = r.value; auto++; }
    else { out[name] = { ...FALLBACK, pending: true }; failed.push(name); }
  });

  // Anything past the per-request cap gets the fallback now and a real lookup
  // on the next request, by which point the cache will usually have it.
  for(const name of unknown.slice(AUTO_LIMIT)){
    out[name] = { ...FALLBACK, pending: true };
  }

  out._default = FALLBACK;
  out._disclaimer = DISCLAIMER;

  notes.push(`Guidance: ${wanted.length} diseases in this dataset — `
    + `${matched} from the curated library (${aliased} matched by alias), `
    + `${auto} auto-compiled, ${wanted.length - matched - auto} unresolved`);
  if(failed.length)  notes.push(`Guidance auto-lookup returned nothing for: ${failed.join(', ')}`);
  if(unknown.length > AUTO_LIMIT){
    notes.push(`Guidance: ${unknown.length - AUTO_LIMIT} disease(s) deferred past the per-request `
      + `lookup cap and will resolve on the next call: ${unknown.slice(AUTO_LIMIT).join(', ')}`);
  }
  if(unknown.length){
    notes.push(`Guidance: consider writing library entries for ${unknown.join(', ')} — `
      + `hand-written entries are better than auto-compiled ones.`);
  }

  return { guidance: out, notes };
}

/**
 * Walk a finished outbreaks payload and pull out every disease name in it —
 * countries, states and cities alike. This is what guarantees "every pandemic
 * on the list" is covered, because the list is built from the same data.
 */
export function collectDiseaseNames(payload){
  const names = new Set();
  for(const bucket of ['countries', 'admin1', 'cities']){
    for(const rec of Object.values(payload[bucket] || {})){
      for(const d of (rec.diseases || [])) if(d && d.name) names.add(d.name);
    }
  }
  return [...names];
}
