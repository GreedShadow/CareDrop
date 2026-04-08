import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, MessageCircleMore, Minus, X } from "lucide-react";
import {
  AIPanel,
  AnalyticsCard,
  Badge,
  Flashcard,
  HeroMetric,
  ProgressRing,
  SidebarNavButton,
  SubjectTab,
} from "./caredrop/components";
import {
  FLASHCARD_SET_SIZE,
  LOGO_SRC,
  QUIZ_SET_SIZE,
  RECENT_MEMORY_LIMIT,
  SIMULATION_BATCH_SIZE,
  SIMULATION_SIZE_OPTIONS,
  SUPPORTED_UPLOAD_EXTENSIONS,
} from "./caredrop/constants";
import {
  buildStudyText,
  clearAuthSession,
  getAuthRedirectUrl,
  getDateKey,
  getGreeting,
  getJson,
  getLocalDateLabel,
  getProgressStorageKey,
  getStudyStreak,
  hashSecret,
  isAdminEmail,
  loadAccounts,
  loadAuthSession,
  loadPersisted,
  loadRequestPersisted,
  mapSupabaseUser,
  normalizeAiErrorMessage,
  normalizeAuthErrorMessage,
  postJson,
  readTextFileLocally,
  saveAccounts,
  saveAuthSession,
  uploadFileForExtraction,
  useWindowWidth,
} from "./caredrop/app-utils";
import { clamp, formatTopicHeading, normalize, shuffle, uid, uniqueBy } from "./caredrop/helpers";
import {
  buildCalendarDays,
  formatDateKey,
  getDateInputValue,
  getMonthLabel,
  getOverduePlannerItems,
  getPlannerCompletionRate,
  getUpcomingEvents,
  PLANNER_EVENT_TYPES,
  PLANNER_MODE_OPTIONS,
  shiftMonth,
  sortByDateAsc,
  sortByDateDesc,
} from "./caredrop/planning";
import { C } from "./caredrop/theme";
import { supabase, supabaseConfigured } from "./lib/supabaseClient";

const SEED_QUESTION_BANK = {
  Fundamentals: [
    { q: "What is the first priority when a patient suddenly becomes unresponsive?", a: "Assess responsiveness, call for help, and check airway, breathing, and circulation. Start CPR if no pulse is present.", difficulty: "easy", topic: "basic life support" },
    { q: "Why is hand hygiene the single most important nursing intervention?", a: "It breaks the chain of infection and prevents transmission of pathogens between patients, staff, and surfaces.", difficulty: "easy", topic: "infection control" },
    { q: "Which type of isolation is used for pulmonary tuberculosis?", a: "Airborne isolation in a negative-pressure room with N95 mask use.", difficulty: "medium", topic: "isolation precautions" },
    { q: "What is the best site to check capillary refill in an adult?", a: "The nail bed of a finger or toe. Normal refill is usually 2 seconds or less.", difficulty: "easy", topic: "assessment" },
    { q: "What is the safe angle for an intramuscular injection in adults?", a: "Ninety degrees into a large muscle such as the ventrogluteal or vastus lateralis site.", difficulty: "easy", topic: "medication administration" },
    { q: "Why is patient identification required before every medication pass?", a: "It reduces wrong-patient medication errors and supports safe administration standards.", difficulty: "easy", topic: "patient safety" },
    { q: "What is the nurse's priority when a patient reports chest pain?", a: "Assess pain, obtain vital signs, support oxygenation as ordered, and rapidly escalate because cardiac ischemia is time-sensitive.", difficulty: "medium", topic: "priority setting" },
    { q: "Why should side rails not be used as a routine restraint alternative?", a: "Improper use can increase injury risk and does not replace ongoing fall-prevention assessment.", difficulty: "medium", topic: "safety" },
    { q: "What is the purpose of the nursing process?", a: "It provides a systematic method for assessment, diagnosis, planning, implementation, and evaluation of care.", difficulty: "easy", topic: "nursing process" },
    { q: "What is the best first action when a sterile field becomes contaminated?", a: "Recognize the break in sterile technique and replace the contaminated field or item before continuing.", difficulty: "medium", topic: "sterile technique" },
    { q: "A patient develops sudden stridor after a procedure. What is the nurse's priority response?", a: "Treat it as an airway emergency, call for immediate help, support oxygenation, and prepare for rapid airway intervention.", difficulty: "hard", topic: "airway emergency" },
    { q: "Which finding most strongly suggests sepsis is progressing to instability?", a: "Worsening mental status, hypotension, tachycardia, and poor perfusion together suggest possible septic shock and need urgent escalation.", difficulty: "hard", topic: "sepsis recognition" },
    { q: "During triage, which patient should be assessed first: chest pain, fever, or stable post-op discomfort?", a: "The patient with possible life-threatening compromise such as chest pain suggestive of acute coronary syndrome should be assessed first.", difficulty: "hard", topic: "triage priority" },
    { q: "What is the safest way to verify a nasogastric tube before giving feeding or medication?", a: "Follow the facility method for placement confirmation, most safely using approved tube-position verification before anything enters the tube.", difficulty: "medium", topic: "enteral safety" },
    { q: "Why is repositioning a pressure-injury prevention priority for immobile patients?", a: "Regular repositioning reduces prolonged tissue pressure, improves perfusion, and lowers the risk of skin breakdown.", difficulty: "easy", topic: "skin integrity" },
    { q: "What should the nurse do first when a patient says the pain is suddenly much worse than before?", a: "Reassess the pain fully, check vital signs, and determine whether the change suggests a new urgent complication rather than routine discomfort.", difficulty: "medium", topic: "pain assessment" },
    { q: "What is the nurse's priority when a patient begins choking but can still cough forcefully?", a: "Encourage the patient to continue coughing and stay ready to intervene if the airway becomes more obstructed.", difficulty: "easy", topic: "airway support" },
    { q: "Why should documentation be timely and objective?", a: "It supports continuity of care, legal safety, and accurate communication without adding opinion or unsupported conclusions.", difficulty: "easy", topic: "documentation" },
    { q: "Which assessment finding should be escalated first after starting a blood transfusion?", a: "Fever, chills, dyspnea, back pain, or a feeling of doom because these may signal an acute transfusion reaction.", difficulty: "hard", topic: "transfusion safety" },
    { q: "What is the priority safety action before assisting a weak patient out of bed for the first time after surgery?", a: "Assess stability first, control the environment, and use support or extra help because post-op patients are at high fall risk.", difficulty: "medium", topic: "fall prevention" },
    { q: "Why is a focused neurologic check important after any sudden change in mentation?", a: "A rapid mental-status change may signal hypoxia, hypoglycemia, stroke, infection, or another evolving emergency that needs urgent clarification.", difficulty: "hard", topic: "neurologic assessment" },
    { q: "What does informed consent require from the nurse during routine care?", a: "The nurse witnesses voluntariness and understanding concerns, then advocates if the patient seems confused or pressured.", difficulty: "medium", topic: "legal foundations" },
    { q: "What is the most reliable way to prevent patient falls during toileting rounds?", a: "Anticipate toileting needs, answer call lights promptly, and stay with high-risk patients when needed.", difficulty: "easy", topic: "fall prevention" },
    { q: "Why is SBAR useful during nursing handoff?", a: "It organizes urgent information into a concise structure so the next clinician can understand the problem and act safely.", difficulty: "easy", topic: "handoff communication" },
    { q: "When a patient refuses a prescribed treatment, what is the nurse's best response?", a: "Assess understanding, explore concerns, provide clear information, and respect the patient's right while documenting and escalating appropriately.", difficulty: "medium", topic: "patient rights" },
    { q: "Which patient needs the highest priority assessment: new confusion, mild nausea, or chronic shoulder pain?", a: "New confusion because an acute change in mentation may be the earliest sign of serious deterioration.", difficulty: "hard", topic: "priority setting" },
    { q: "What is the nurse's first action if a medication dose seems unusually high?", a: "Pause before administration, verify the order, check the reference if needed, and clarify the dose rather than guessing.", difficulty: "easy", topic: "medication safety" },
    { q: "What is the safest first response when a post-fall patient insists they are fine and tries to stand up immediately?", a: "Stop the patient from standing, assess for injury and neurologic change first, and only mobilize again after safety is re-established.", difficulty: "medium", topic: "fall response" },
    { q: "Why is pain reassessment required after an analgesic is given?", a: "It confirms whether the intervention worked, whether the dose was adequate, and whether adverse effects or escalating pain are developing.", difficulty: "easy", topic: "pain management" },
    { q: "What should the nurse prioritize when a patient with dysphagia is about to receive oral medication?", a: "Confirm swallowing safety first and use the approved route or formulation because aspiration risk overrides routine administration.", difficulty: "hard", topic: "aspiration prevention" },
    { q: "Which finding after prolonged bed rest suggests orthostatic intolerance?", a: "Dizziness or weakness during position change suggests the patient may not tolerate sudden standing and needs slower mobilization.", difficulty: "medium", topic: "mobility" },
    { q: "Why are time-outs required before invasive procedures?", a: "They confirm the correct patient, procedure, and site and reduce preventable wrong-site or wrong-patient events.", difficulty: "easy", topic: "patient safety" },
    { q: "What should the nurse do first when a patient with a seizure history says an aura is starting?", a: "Protect the patient from injury, keep the airway environment safe, and prepare for seizure precautions before the event progresses.", difficulty: "hard", topic: "seizure precautions" },
    { q: "What is the best action when a confused patient tries to remove an oxygen mask repeatedly?", a: "Assess the cause of agitation, support oxygenation, reorient calmly, and address reversible triggers rather than escalating force immediately.", difficulty: "medium", topic: "behavioral safety" },
    { q: "Why does the nurse verify allergies even when a patient says a drug was taken before without problems?", a: "Allergy status can change, prior exposure does not guarantee safety, and verification remains part of safe medication administration.", difficulty: "easy", topic: "medication safety" },
    { q: "What is the nursing priority when a patient suddenly reports difficulty breathing while lying flat?", a: "Raise the head of the bed, assess oxygenation, and escalate quickly because orthopnea can signal acute cardiopulmonary compromise.", difficulty: "hard", topic: "respiratory priority" },
    { q: "Why is hourly rounding useful on a busy unit?", a: "It anticipates pain, position, personal needs, and safety concerns before they become falls, delays, or call-light emergencies.", difficulty: "easy", topic: "preventive care" },
  ],
  Pharmacology: [
    { q: "What is the priority assessment before administering digoxin?", a: "Check the apical pulse for 1 full minute and hold if it is below the ordered parameter. Also review potassium because hypokalemia increases toxicity risk.", difficulty: "medium", topic: "cardiac drugs" },
    { q: "A patient on heparin has an aPTT of 180 seconds. What is the antidote?", a: "Protamine sulfate. It reverses the anticoagulant effect of heparin and must be given carefully because it may cause hypotension.", difficulty: "hard", topic: "anticoagulants" },
    { q: "Why is metformin held before and after IV contrast procedures?", a: "Contrast can reduce kidney function, which raises the risk of metformin-associated lactic acidosis.", difficulty: "medium", topic: "antidiabetics" },
    { q: "What is the priority pre-administration assessment before IV morphine?", a: "Respiratory rate and level of consciousness. Hold and reassess if respirations are significantly depressed.", difficulty: "easy", topic: "opioids" },
    { q: "What is the antidote for acetaminophen overdose?", a: "N-acetylcysteine, which replenishes glutathione and reduces liver injury when given early.", difficulty: "hard", topic: "toxicology" },
    { q: "Which lab value is most important before giving warfarin?", a: "The INR. It shows anticoagulation intensity and helps determine bleeding risk.", difficulty: "medium", topic: "anticoagulants" },
    { q: "What teaching is essential for a patient taking furosemide?", a: "Monitor for dizziness, dehydration, and low potassium, and rise slowly to prevent orthostatic hypotension.", difficulty: "easy", topic: "diuretics" },
    { q: "Why should nitroglycerin tablets be stored in their original dark bottle?", a: "Nitroglycerin is sensitive to light and moisture, which can reduce potency if stored improperly.", difficulty: "easy", topic: "antianginals" },
    { q: "What adverse effect should be watched for after insulin administration?", a: "Hypoglycemia, especially if food intake is delayed or the dose is too high.", difficulty: "easy", topic: "insulin" },
    { q: "Why should aminoglycosides be monitored carefully?", a: "They can cause nephrotoxicity and ototoxicity, so kidney function and hearing-related symptoms matter.", difficulty: "medium", topic: "antibiotics" },
  ],
  "Medical-Surgical": [
    { q: "A post-op patient has urine output of 15 mL/hour for 3 hours. What does this suggest?", a: "Oliguria. It may indicate hypovolemia, renal hypoperfusion, or obstruction and requires prompt assessment.", difficulty: "medium", topic: "renal" },
    { q: "What does tracheal deviation away from the affected side indicate?", a: "Tension pneumothorax, a life-threatening emergency requiring immediate decompression.", difficulty: "hard", topic: "respiratory" },
    { q: "Which electrolyte imbalance causes tall peaked T-waves?", a: "Hyperkalemia. Severe cases can progress to lethal dysrhythmias.", difficulty: "hard", topic: "electrolytes" },
    { q: "A patient with pulmonary embolism usually presents with what sudden symptom pattern?", a: "Sudden dyspnea, pleuritic chest pain, tachycardia, and possible hypoxemia.", difficulty: "hard", topic: "cardiovascular" },
    { q: "Why is Homans' sign no longer used to diagnose DVT?", a: "It is unreliable and may be negative even in true DVT. Doppler ultrasound is preferred.", difficulty: "medium", topic: "vascular" },
    { q: "What is the nurse's priority action for suspected hypoglycemia in a conscious diabetic patient?", a: "Give 15 grams of fast-acting carbohydrate, then recheck blood glucose after 15 minutes.", difficulty: "easy", topic: "endocrine" },
    { q: "What is the earliest sign of increased intracranial pressure?", a: "A change in level of consciousness, such as restlessness or confusion.", difficulty: "hard", topic: "neurologic" },
    { q: "Which finding after thyroidectomy requires immediate action?", a: "Stridor or respiratory distress, which may indicate airway obstruction or hemorrhage.", difficulty: "hard", topic: "post-op care" },
    { q: "What is the best position for a patient with acute dyspnea?", a: "High Fowler's or the most upright tolerated position to support ventilation.", difficulty: "easy", topic: "respiratory" },
    { q: "What should the nurse suspect when a patient with GI bleeding becomes cool, pale, and tachycardic?", a: "Hypovolemic shock from blood loss requiring urgent assessment, support, and escalation.", difficulty: "hard", topic: "shock" },
    { q: "What is the first nursing concern when a patient with heart failure suddenly gains 2 kilograms in two days?", a: "Fluid retention and worsening congestion because rapid weight gain can reflect decompensating heart failure.", difficulty: "medium", topic: "cardiac" },
    { q: "Which finding is most urgent in a patient with COPD receiving oxygen therapy?", a: "Worsening somnolence, severe dyspnea, or dropping oxygen saturation because these suggest failing ventilation, not just routine disease symptoms.", difficulty: "hard", topic: "respiratory" },
    { q: "Why is strict intake and output monitoring important in acute kidney injury?", a: "Small fluid shifts matter, and accurate intake and output helps identify worsening retention, overload, or poor renal perfusion early.", difficulty: "medium", topic: "renal" },
    { q: "What should the nurse do first for a patient with suspected stroke who has new unilateral weakness?", a: "Treat it as time-sensitive, assess airway and glucose, note the onset time, and activate urgent stroke evaluation.", difficulty: "hard", topic: "neurologic" },
    { q: "Which symptom pattern most strongly suggests acute appendicitis is worsening?", a: "Increasing abdominal pain with guarding, fever, and rebound tenderness suggests escalating inflammation or perforation risk.", difficulty: "medium", topic: "gastrointestinal" },
    { q: "What is the priority teaching for a patient taking levothyroxine?", a: "Take it consistently, usually on an empty stomach, and understand that symptom improvement is gradual rather than immediate.", difficulty: "easy", topic: "endocrine" },
    { q: "Why is chest-tube bubbling in the water-seal chamber important to assess?", a: "Intermittent bubbling may reflect expected air escape, but continuous bubbling can suggest an air leak that needs evaluation.", difficulty: "medium", topic: "respiratory" },
    { q: "Which finding after abdominal surgery should raise concern for paralytic ileus?", a: "Increasing distention, absent bowel sounds, nausea, and inability to tolerate intake suggest slowed bowel function.", difficulty: "medium", topic: "gastrointestinal" },
    { q: "What is the nurse's priority for a patient with suspected myocardial infarction who reports crushing chest pain?", a: "Rapid cardiac assessment, monitoring, and escalation are critical because myocardial injury is time-sensitive.", difficulty: "hard", topic: "cardiac" },
    { q: "What is the safest nursing response to symptomatic hypocalcemia after thyroid surgery?", a: "Recognize it early, assess for tingling or tetany, and escalate because airway-threatening spasm can develop.", difficulty: "hard", topic: "electrolytes" },
    { q: "What is the main concern when a patient with cirrhosis becomes increasingly drowsy and confused?", a: "Possible hepatic encephalopathy, which requires prompt assessment and management of the precipitating cause.", difficulty: "hard", topic: "gastrointestinal" },
    { q: "Why should a patient with pancreatitis remain NPO during an acute flare if ordered?", a: "Resting the pancreas helps reduce stimulation and can support pain control and recovery.", difficulty: "easy", topic: "gastrointestinal" },
    { q: "What does black, tarry stool usually suggest in Med-Surg review?", a: "Melena, which often points to upper GI bleeding and should not be dismissed as a minor finding.", difficulty: "easy", topic: "gastrointestinal" },
    { q: "What finding matters most after insulin administration in a patient who is suddenly diaphoretic and shaky?", a: "Suspect hypoglycemia first and confirm rapidly so treatment can start without delay.", difficulty: "easy", topic: "endocrine" },
    { q: "Why is neurovascular assessment important after casting a fractured limb?", a: "Circulation, movement, and sensation can worsen quickly if swelling compromises the extremity.", difficulty: "medium", topic: "musculoskeletal" },
    { q: "Which finding is most concerning in a patient with suspected bowel obstruction?", a: "Persistent vomiting, distention, worsening pain, and absent bowel function together suggest escalating obstruction that needs urgent review.", difficulty: "hard", topic: "gastrointestinal" },
    { q: "What is the priority concern when a patient with diabetic ketoacidosis becomes increasingly drowsy?", a: "Worsening metabolic instability or cerebral compromise needs urgent reassessment because declining mentation is never routine in DKA.", difficulty: "hard", topic: "endocrine" },
    { q: "Why is a sudden drop in blood pressure with cool clammy skin after surgery alarming?", a: "It can reflect shock from bleeding or poor perfusion and requires rapid assessment rather than routine observation.", difficulty: "hard", topic: "post-op care" },
    { q: "What should the nurse suspect when a patient with asthma has a suddenly quiet chest and worsening distress?", a: "Minimal air movement in a struggling patient may signal severe obstruction and impending respiratory failure.", difficulty: "hard", topic: "respiratory" },
    { q: "What is the safest nursing interpretation of new unilateral calf swelling and warmth?", a: "Suspect DVT and avoid unnecessary manipulation while urgent evaluation is arranged.", difficulty: "medium", topic: "vascular" },
    { q: "Why is daily weight more reliable than edema alone in heart-failure monitoring?", a: "Fluid retention often appears in weight first, making daily weights one of the most sensitive trend markers.", difficulty: "medium", topic: "cardiac" },
    { q: "Which neurologic change after head injury is most urgent to escalate?", a: "A new decline in responsiveness or pupil change suggests rising intracranial danger and requires urgent escalation.", difficulty: "hard", topic: "neurologic" },
    { q: "What does coffee-ground emesis suggest in a Med-Surg patient?", a: "Partially digested blood, often from upper GI bleeding, which still needs urgent assessment even if active bright-red bleeding is not seen.", difficulty: "medium", topic: "gastrointestinal" },
    { q: "What is the nursing priority for a patient with severe hyperglycemia and signs of dehydration?", a: "Assess perfusion and mental status, support fluids as ordered, and treat it as a potentially unstable metabolic emergency.", difficulty: "medium", topic: "endocrine" },
    { q: "Why is anuria after surgery more urgent than reduced output alone?", a: "Complete absence of urine can point to obstruction or severe renal compromise and needs immediate clarification.", difficulty: "hard", topic: "renal" },
  ],
  "Maternal & Newborn": [
    { q: "Late decelerations during labor usually mean what?", a: "Uteroplacental insufficiency. Reposition, give oxygen, increase fluids, stop oxytocin, and notify the provider.", difficulty: "hard", topic: "fetal monitoring" },
    { q: "What are the 4 Ts of postpartum hemorrhage?", a: "Tone, Trauma, Tissue, and Thrombin.", difficulty: "medium", topic: "postpartum" },
    { q: "What is the expected fundal location immediately after delivery?", a: "At the level of the umbilicus.", difficulty: "easy", topic: "postpartum" },
    { q: "What does HELLP stand for?", a: "Hemolysis, Elevated Liver enzymes, and Low Platelets.", difficulty: "hard", topic: "complications" },
    { q: "A newborn with an Apgar score of 4 at 1 minute needs what general response?", a: "Prompt resuscitative support such as stimulation and assisted breathing as indicated, then reassessment.", difficulty: "medium", topic: "newborn" },
    { q: "What is the priority finding in placental abruption?", a: "Painful vaginal bleeding with a tender, rigid uterus and fetal distress.", difficulty: "hard", topic: "antepartum complications" },
    { q: "What is a priority nursing intervention for a patient receiving magnesium sulfate?", a: "Monitor respirations, deep tendon reflexes, and urine output for toxicity.", difficulty: "medium", topic: "high-risk pregnancy" },
    { q: "Why is skin-to-skin contact encouraged after birth?", a: "It promotes thermoregulation, bonding, breastfeeding, and newborn stabilization.", difficulty: "easy", topic: "newborn care" },
    { q: "What assessment finding suggests uterine atony?", a: "A boggy uterus with increased postpartum bleeding.", difficulty: "medium", topic: "postpartum" },
    { q: "Why should the nurse monitor lochia after delivery?", a: "Changes in amount, color, or odor can signal expected recovery or possible complications.", difficulty: "easy", topic: "postpartum" },
  ],
  Pediatrics: [
    { q: "A child with drooling, tripod position, and muffled voice most likely has what emergency?", a: "Epiglottitis. Avoid throat examination and prepare for airway support.", difficulty: "hard", topic: "respiratory emergencies" },
    { q: "What is the epinephrine dose rule for pediatric anaphylaxis?", a: "0.01 mg/kg of 1:1000 intramuscularly, usually into the anterolateral thigh.", difficulty: "hard", topic: "emergency" },
    { q: "Why is respiratory rate a critical pediatric assessment?", a: "Children compensate until late, so an increased respiratory rate can be an early sign of deterioration.", difficulty: "easy", topic: "vital signs" },
    { q: "What is a classic sign of dehydration in an infant?", a: "Sunken fontanelle, along with dry mucous membranes and fewer wet diapers.", difficulty: "easy", topic: "fluids" },
    { q: "What is the priority teaching for oral rehydration therapy?", a: "Give small, frequent sips and continue reassessing hydration status.", difficulty: "easy", topic: "fluids" },
    { q: "What is the priority action for a febrile child actively seizing?", a: "Protect the airway and child from injury, do not restrain, and time the seizure.", difficulty: "medium", topic: "neurologic" },
    { q: "Why should aspirin generally be avoided in children with viral illness?", a: "Because it is associated with Reye syndrome.", difficulty: "medium", topic: "medication safety" },
    { q: "What is the priority sign of severe bronchiolitis or asthma in a child?", a: "Increasing work of breathing, fatigue, and decreasing oxygen saturation.", difficulty: "hard", topic: "respiratory" },
    { q: "Why are weight-based doses used in pediatrics?", a: "Because medication safety depends on matching the dose to the child's size and developmental needs.", difficulty: "easy", topic: "medication safety" },
    { q: "What is the first concern when assessing a child with persistent vomiting and diarrhea?", a: "Fluid volume deficit and the risk of rapid dehydration.", difficulty: "medium", topic: "fluids" },
  ],
  "Psychiatric Nursing": [
    { q: "What is the best therapeutic response to 'Nobody cares about me'?", a: "It sounds like you're feeling very alone right now.", difficulty: "medium", topic: "therapeutic communication" },
    { q: "What syndrome is suggested by muscle rigidity, high fever, and altered mental status after antipsychotic use?", a: "Neuroleptic malignant syndrome.", difficulty: "hard", topic: "adverse effects" },
    { q: "What is the therapeutic lithium range?", a: "Typically 0.6 to 1.2 mEq/L, with higher levels increasing toxicity risk.", difficulty: "medium", topic: "mood stabilizers" },
    { q: "What severe alcohol withdrawal complication peaks at 24 to 72 hours?", a: "Delirium tremens.", difficulty: "hard", topic: "withdrawal" },
    { q: "What is the priority when a patient voices suicidal intent?", a: "Ensure safety through direct assessment, close observation, and immediate escalation per protocol.", difficulty: "hard", topic: "crisis intervention" },
    { q: "Why are open-ended questions used in therapeutic communication?", a: "They invite the patient to share more freely and help the nurse assess thoughts and feelings.", difficulty: "easy", topic: "communication" },
    { q: "What is a common SSRI teaching point?", a: "Benefits may take several weeks, and the patient should watch for worsening mood or suicidal thoughts early in treatment.", difficulty: "medium", topic: "antidepressants" },
    { q: "How should the nurse respond to hallucinations?", a: "Acknowledge the patient's experience without validating the hallucination as real, then refocus on reality and safety.", difficulty: "medium", topic: "psychosis" },
    { q: "What is the therapeutic goal of setting limits?", a: "To maintain safety and structure while remaining calm, consistent, and respectful.", difficulty: "easy", topic: "behavior management" },
    { q: "Why is medication adherence teaching important in bipolar disorder?", a: "Stopping medication abruptly can trigger relapse, instability, and safety risks.", difficulty: "medium", topic: "mood disorders" },
  ],
  "Community Health": [
    { q: "What disease does the DOH DOTS program primarily address?", a: "Tuberculosis.", difficulty: "easy", topic: "infectious disease" },
    { q: "What level of prevention does immunization belong to?", a: "Primary prevention.", difficulty: "easy", topic: "prevention" },
    { q: "What dengue warning signs should trigger urgent referral?", a: "Persistent vomiting, severe abdominal pain, bleeding, lethargy, and respiratory distress.", difficulty: "medium", topic: "endemic disease" },
    { q: "What is contact tracing used for in public health?", a: "To identify exposed individuals, interrupt transmission, and guide monitoring or treatment.", difficulty: "medium", topic: "surveillance" },
    { q: "Why is health teaching important in barangay nursing?", a: "It improves prevention, early recognition, treatment adherence, and community participation.", difficulty: "easy", topic: "health promotion" },
    { q: "What is the priority nursing response to a suspected measles outbreak?", a: "Prompt reporting, isolation measures, contact follow-up, and immunization review.", difficulty: "hard", topic: "outbreak response" },
    { q: "What is the nurse's role in disaster triage?", a: "Sort patients by urgency to maximize survival and use resources effectively.", difficulty: "medium", topic: "disaster nursing" },
    { q: "What is tertiary prevention?", a: "Measures that reduce complications and improve function after disease is established.", difficulty: "medium", topic: "prevention" },
    { q: "Why is safe water education important in community nursing?", a: "It reduces preventable diarrheal disease and supports family-level prevention.", difficulty: "easy", topic: "sanitation" },
    { q: "What is the purpose of directly observed therapy in TB care?", a: "It improves adherence and lowers the risk of treatment failure and resistance.", difficulty: "medium", topic: "infectious disease" },
  ],
  "Leadership & Management": [
    { q: "Which task is appropriate for UAP delegation?", a: "Obtaining routine vital signs on a stable patient.", difficulty: "easy", topic: "delegation" },
    { q: "What responsibilities cannot be delegated by the nurse?", a: "Assessment, teaching, evaluation, and judgment-based clinical decisions.", difficulty: "medium", topic: "delegation" },
    { q: "What is the best first response to a conflict between team members during a shift?", a: "Address it early, privately, and professionally to protect patient care and team function.", difficulty: "medium", topic: "conflict management" },
    { q: "What is the nurse manager's priority during a medication error event?", a: "Protect the patient, assess for harm, report the event, and support accurate documentation.", difficulty: "hard", topic: "safety" },
    { q: "When assigning patients, what factor should be prioritized?", a: "Patient acuity and the competence of available staff.", difficulty: "medium", topic: "assignment" },
    { q: "What is the purpose of incident reporting?", a: "To improve safety and systems, not to punish staff.", difficulty: "easy", topic: "quality improvement" },
    { q: "What is the best task for a float nurse who is unfamiliar with a unit?", a: "Stable patients and routine tasks within clearly verified competency.", difficulty: "medium", topic: "staffing" },
    { q: "Why is closed-loop communication important during emergencies?", a: "It confirms that directions were heard, understood, and acted on.", difficulty: "hard", topic: "communication" },
    { q: "What is the nurse leader's role during staffing shortage?", a: "Prioritize patient safety, match assignments carefully, and communicate escalation needs early.", difficulty: "hard", topic: "staffing" },
    { q: "Why is delegation follow-up important?", a: "The nurse remains accountable for the outcome and must verify that the task was completed safely.", difficulty: "medium", topic: "delegation" },
  ],
};

const BANK_ITEMS_PER_BUCKET = 42;
const BUCKET_DIFFICULTIES = ["easy", "medium", "hard"];
const QUESTION_LEAD_INS = [
  "Board recall:",
  "Focused review:",
  "Nursing priority check:",
  "PRC NLE review:",
  "Clinical decision point:",
  "Exam coaching prompt:",
];
const QUESTION_TEMPLATES = [
  (entry) => entry.q,
  (entry, subject) => `Which statement is most accurate about ${entry.topic} in ${subject}?`,
  (entry, subject) => `A patient scenario highlights ${entry.topic}. What should the nurse remember first in ${subject}?`,
  (entry, subject) => `What is the safest nursing takeaway for ${entry.topic} in ${subject}?`,
  (entry, subject) => `Which clue most strongly points to the correct response for ${entry.topic} in ${subject}?`,
  (entry, subject, difficulty) => `For a ${difficulty} ${subject} review item about ${entry.topic}, which response is best?`,
  (entry, subject) => `During review of ${subject}, what key principle should be tied to ${entry.topic}?`,
  (entry, subject) => `If ${entry.topic} appears in a ${subject} question stem, what answer should come to mind?`,
  (entry, subject) => `Which nursing judgment matters most when ${entry.topic} appears in ${subject}?`,
  (entry, subject, difficulty) => `A ${difficulty} board item on ${entry.topic} is testing which safe response in ${subject}?`,
  (entry, subject) => `What board-level reminder should stay attached to ${entry.topic} during ${subject} review?`,
];
const ANSWER_REMINDERS = [
  (entry, subject) => `Board focus: connect ${entry.topic} to the safest nursing priority in ${subject}.`,
  (entry, subject, difficulty) => `Review clue: this is the ${difficulty} takeaway the stem is pointing toward in ${subject}.`,
  (entry) => `Memory hook: if the item is really about ${entry.topic}, this is the answer to anchor first.`,
  (entry, subject) => `Clinical anchor: keep ${entry.topic} tied to the safest next nursing step in ${subject}.`,
  (entry) => `Review note: this concept is meant to feel automatic by the time you sit for boards.`,
];

function normalizeSeedKey(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

function buildExpandedQuestion(entry, subject, difficulty, variantIndex) {
  const leadIn = QUESTION_LEAD_INS[Math.floor(variantIndex / QUESTION_TEMPLATES.length) % QUESTION_LEAD_INS.length];
  const template = QUESTION_TEMPLATES[variantIndex % QUESTION_TEMPLATES.length];
  return `${leadIn} ${template(entry, subject, difficulty)}`.trim();
}

function buildExpandedAnswer(entry, subject, difficulty, variantIndex) {
  const reminder = ANSWER_REMINDERS[variantIndex % ANSWER_REMINDERS.length];
  return `${entry.a} ${reminder(entry, subject, difficulty)}`.trim();
}

function buildExpandedBank(seedBank, targetPerBucket = BANK_ITEMS_PER_BUCKET) {
  const bank = {};

  for (const [subject, entries] of Object.entries(seedBank)) {
    bank[subject] = [];

    for (const difficulty of BUCKET_DIFFICULTIES) {
      const seeds = entries.filter((entry) => entry.difficulty === difficulty);
      const bucket = [];
      const seen = new Set();

      if (!seeds.length) {
        continue;
      }

      let variantIndex = 0;
      while (bucket.length < targetPerBucket && variantIndex < targetPerBucket * 30) {
        const seed = seeds[variantIndex % seeds.length];
        const question = buildExpandedQuestion(seed, subject, difficulty, variantIndex);
        const key = `${subject}-${difficulty}-${normalizeSeedKey(question)}`;

        if (!seen.has(key)) {
          seen.add(key);
          bucket.push({
            ...seed,
            q: question,
            a: buildExpandedAnswer(seed, subject, difficulty, variantIndex),
            subject,
            difficulty,
            seedQuestion: seed.q,
          });
        }

        variantIndex += 1;
      }

      bank[subject].push(...bucket);
    }
  }

  return bank;
}

const QUESTION_BANK = buildExpandedBank(SEED_QUESTION_BANK);
const SUBJECT_OPTIONS = [...Object.keys(QUESTION_BANK), "Mixed Review"];
const DIFFICULTIES = ["All", "easy", "medium", "hard"];
const ENCOURAGEMENTS = [
  "You've got this, future RN.",
  "One focused session at a time still counts.",
  "Read the stem slowly. Your nursing judgment is getting stronger.",
  "Progress matters more than perfection.",
  "The board exam is hard. You're training for it every day.",
  "A calm review session still moves you forward.",
  "Missed questions are still helping you pass.",
  "You are building safe instincts, not just memorizing facts.",
  "Small wins count on low-energy days too.",
  "Pause, breathe, then trust your nursing priorities.",
  "Every set you finish sharpens your recall.",
  "This is hard work, and you are doing it well.",
  "You can be gentle with yourself and still make strong progress.",
  "One more set is one more step closer.",
  "Slow progress is still real progress.",
];

function buildLocalSummary(text) {
  const cleaned = String(text || "").replace(/\r/g, " ").trim();
  if (!cleaned) {
    return "Paste notes or upload a document to generate a reviewer summary.";
  }

  const parts = sentenceSplit(cleaned).slice(0, 28);

  if (!parts.length) {
    return "Paste notes or upload a document to generate a reviewer summary.";
  }

  const inferredSubject = inferSubject(cleaned);
  const keywordLines = extractKeywords(cleaned).slice(0, 6);
  const topicGroups = new Map();

  parts.forEach((line) => {
    const topic = inferTopic(line);
    if (!topicGroups.has(topic)) {
      topicGroups.set(topic, []);
    }
    topicGroups.get(topic).push(line);
  });

  const groupedTopics = Array.from(topicGroups.entries())
    .sort((left, right) => right[1].length - left[1].length)
    .slice(0, 5);

  const lines = [
    `DETAILED REVIEWER SUMMARY`,
    `Likely focus: ${inferredSubject}`,
    `Topics found: ${groupedTopics.map(([topic]) => formatTopicHeading(topic)).join(", ")}`,
    "",
    `MAIN POINT`,
    parts[0],
  ];

  if (keywordLines.length) {
    lines.push("", "KEYWORDS", keywordLines.join(", "));
  }

  groupedTopics.forEach(([topic, topicLines], index) => {
    const overview = topicLines[0];
    const detailPoints = topicLines.slice(0, 5);
    const assessmentCue =
      topicLines.find((line) =>
        /(assess|monitor|observe|check|evaluate|vital signs|inspect|palpate|auscultate)/i.test(line)
      ) || topicLines[1] || overview;
    const interventionCue =
      topicLines.find((line) =>
        /(intervention|administer|position|teach|educate|withhold|notify|support|oxygen|fluids|medication|manage)/i.test(line)
      ) || topicLines[2] || overview;
    const cautionCue =
      topicLines.find((line) =>
        /(priority|first|unsafe|critical|warning|monitor|withhold|notify|emergency|contraindicat|risk|avoid|do not|unless|only if)/i.test(line)
      ) || "";

    lines.push(
      "",
      `TOPIC ${index + 1}: ${formatTopicHeading(topic)}`,
      `Overview: ${overview}`,
      `Key review details:`
    );

    detailPoints.forEach((line, detailIndex) => {
      lines.push(`${detailIndex + 1}) ${line}`);
    });

    lines.push(`Assessment focus: ${assessmentCue}`);
    lines.push(`Intervention focus: ${interventionCue}`);

    if (cautionCue) {
      lines.push(`Condition or caution: ${cautionCue}`);
    }

    lines.push(`Board takeaway: Focus on the nursing priority, clue words, and what must be assessed or acted on first for ${formatTopicHeading(topic)}.`);
  });

  lines.push(
    "",
    "FINAL REVIEW NOTE",
    "Use each topic block as a separate review target. After reading this summary, convert the same file into flashcards or quiz questions so the learner can practice each topic one by one."
  );

  return lines.join("\n");
}

function sentenceSplit(text) {
  return String(text || "")
    .replace(/\r/g, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 24);
}

function extractKeywords(text) {
  const stopWords = new Set([
    "about", "after", "again", "because", "before", "between", "during", "every", "focus",
    "their", "there", "these", "those", "under", "which", "while", "would", "nurse", "nursing",
    "patient", "review", "question", "answer", "notes",
  ]);

  return uniqueBy(
    normalize(text)
      .split(/\s+/)
      .filter((word) => word.length > 4 && !stopWords.has(word)),
    (word) => word
  );
}

function inferDifficulty(text) {
  const target = String(text || "").toLowerCase();

  if (["priority", "first", "best", "initial", "critical", "unsafe", "shock", "airway", "delegate", "severe"].some((word) => target.includes(word))) {
    return "hard";
  }

  if (["assess", "monitor", "teaching", "intervention", "medication", "warning", "management"].some((word) => target.includes(word))) {
    return "medium";
  }

  return "easy";
}

function inferSubject(text) {
  const target = String(text || "").toLowerCase();

  if (/(drug|medication|dose|digoxin|insulin|heparin|warfarin|morphine|antibiotic)/.test(target)) return "Pharmacology";
  if (/(postpartum|pregnan|labor|fetus|fundus|lochia|newborn|maternity)/.test(target)) return "Maternal & Newborn";
  if (/(child|infant|pediatric|adolescent|bronchiolitis|epiglottitis)/.test(target)) return "Pediatrics";
  if (/(therapeutic|suicid|depression|hallucination|psychi|mental health|lithium|haloperidol)/.test(target)) return "Psychiatric Nursing";
  if (/(community|prevention|immunization|public health|barangay|dengue|tuberculosis|dots)/.test(target)) return "Community Health";
  if (/(delegate|uap|staff|leadership|management|assignment|incident)/.test(target)) return "Leadership & Management";
  if (/(surgery|shock|respiratory|cardiac|electrolyte|thyroid|embol|hypoglycemia|med-surg)/.test(target)) return "Medical-Surgical";
  return "Fundamentals";
}

function inferTopic(text, fallbackKeyword = "general review") {
  const target = String(text || "").toLowerCase();
  const match = target.match(
    /(airway|breathing|circulation|infection control|patient safety|assessment|delegation|shock|respiratory|cardiac|newborn|postpartum|dehydration|therapeutic communication|prevention|dengue|tuberculosis|medication safety|anticoagulants|opioids|electrolytes|disaster nursing)/
  );

  return (match?.[0] || fallbackKeyword || "general review").trim();
}

function buildCustomEntries(text, selectedSubject) {
  const sentences = sentenceSplit(text).slice(0, 48);
  const keywords = extractKeywords(text);

  return uniqueBy(
    sentences.map((sentence, index) => {
      const inferredSubject = selectedSubject && selectedSubject !== "Mixed Review" ? selectedSubject : inferSubject(sentence);
      const keyword = keywords[index % Math.max(keywords.length, 1)] || inferTopic(sentence);

      return {
        q: `What nursing point should you remember about ${keyword} from these notes?`,
        a: sentence,
        difficulty: inferDifficulty(sentence),
        topic: inferTopic(sentence, keyword),
        subject: inferredSubject,
      };
    }),
    (entry) => `${entry.subject}-${normalize(entry.q)}-${normalize(entry.a)}`
  );
}

function collectIncorrectQuestions(sessions = []) {
  return (sessions || []).flatMap((session) =>
    (session.questions || [])
      .filter(
        (item) =>
          item &&
          item.userAnswer &&
          normalize(item.userAnswer) !== normalize(item.correctAnswer)
      )
      .map((item) => ({
        subject: item.subject || session.subject || "Mixed Review",
        topic: item.topic || session.topic || "",
        difficulty: item.difficulty || session.difficulty || "medium",
        prompt: item.prompt || "",
      }))
  );
}

function buildRemediationEntries(sourceEntries, incorrectItems, weakSubject) {
  const targeted = sourceEntries.filter((entry) =>
    incorrectItems.some(
      (item) =>
        (!item.subject || item.subject === "Mixed Review" || item.subject === entry.subject) &&
        (!item.topic || normalize(entry.topic).includes(normalize(item.topic)) || normalize(item.prompt).includes(normalize(entry.topic)))
    )
  );

  if (targeted.length) {
    return targeted;
  }

  if (weakSubject) {
    const weakSubjectEntries = sourceEntries.filter((entry) => entry.subject === weakSubject);
    if (weakSubjectEntries.length) {
      return weakSubjectEntries;
    }
  }

  return sourceEntries;
}

function matchesStudyFilter(entry, subject, difficulty, topic) {
  const matchesSubject = !subject || subject === "Mixed Review" ? true : entry.subject === subject;
  const matchesDifficulty = difficulty === "All" ? true : entry.difficulty === difficulty;
  const matchesTopic = topic
    ? `${entry.topic || ""} ${entry.q || entry.prompt || ""} ${entry.a || entry.answer || ""} ${entry.rationale || ""}`
        .toLowerCase()
        .includes(topic.toLowerCase())
    : true;

  return matchesSubject && matchesDifficulty && matchesTopic;
}

function cleanQuizPrompt(prompt) {
  return String(prompt || "")
    .replace(/^\s*(question\s*:|q\s*:)\s*/i, "")
    .replace(/\b(answer\s*:|instruction\s*:|directions\s*:).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanQuizOption(option) {
  return String(option || "")
    .replace(/^\s*[A-D][.)]\s*/i, "")
    .replace(/^\s*-\s*/, "")
    .replace(/\b(correct answer|answer|instruction|directions)\b\s*:?.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isInstructionLikeOption(option) {
  const value = normalize(option);
  return (
    !value ||
    value.startsWith("instruction") ||
    value.startsWith("directions") ||
    value.startsWith("answer") ||
    value.includes("choose the best answer") ||
    value.includes("select the best answer") ||
    value.includes("all of the above") ||
    value.includes("none of the above")
  );
}

function toFlashcard(entry, subject) {
  return {
    id: `${subject}-${normalize(entry.q)}`,
    subject,
    difficulty: entry.difficulty || "medium",
    topic: entry.topic || "general",
    question: entry.q,
    answer: entry.a,
    rationale: entry.a,
    notes: `Focus area: ${entry.topic || "general review"}.`,
  };
}

function getAllEntries() {
  return Object.entries(QUESTION_BANK).flatMap(([subject, entries]) =>
    entries.map((entry) => ({ ...entry, subject }))
  );
}

function getExactEntries(sourceEntries, subject, difficulty, topic) {
  return sourceEntries.filter((entry) => matchesStudyFilter(entry, subject, difficulty, topic));
}

function buildFlashcardVariants(entry) {
  const subject = entry.subject;
  const baseId = `${subject}-${normalize(entry.q)}`;
  const topic = entry.topic || "general review";
  const answer = entry.a;
  const rationale = entry.a;
  const notes = `Focus area: ${topic}.`;
  const prompts = [
    entry.q,
    `In ${subject}, what should you remember about ${topic}?`,
    `Board recall: what is the safest nursing takeaway for ${topic}?`,
    `What clue from ${subject} review points to ${topic}?`,
  ];

  return uniqueBy(
    prompts.map((prompt, index) => ({
      id: `${baseId}-card-${index + 1}`,
      subject,
      difficulty: entry.difficulty || "medium",
      topic,
      question: prompt,
      answer,
      rationale,
      notes,
    })),
    (item) => item.id
  );
}

function buildQuizVariants(entry) {
  return [
    { prompt: entry.q, rationale: entry.a },
    {
      prompt: `Which statement is most accurate about ${entry.topic} in ${entry.subject}?`,
      rationale: entry.a,
    },
    {
      prompt: `A nursing student is reviewing ${entry.topic}. Which response is correct?`,
      rationale: entry.a,
    },
    {
      prompt: `Which clue best supports the correct nursing action for ${entry.topic} in ${entry.subject}?`,
      rationale: entry.a,
    },
  ];
}

function buildDistractors(correctAnswer, pool) {
  const distractors = uniqueBy(
    shuffle(pool.filter((item) => normalize(item.a) !== normalize(correctAnswer))),
    (item) => normalize(item.a)
  )
    .slice(0, 3)
    .map((item) => item.a);

  const fallback = [
    "Document the finding and continue routine monitoring.",
    "Delay action until more data becomes available.",
    "Delegate the task before completing the assessment.",
  ];

  while (distractors.length < 3) {
    distractors.push(fallback[distractors.length]);
  }

  return shuffle([correctAnswer, ...distractors]).slice(0, 4);
}

function buildLocalQuizFallback(sourceEntries, subject, difficulty, topic, count, usedPrompts = []) {
  const prioritized = shuffle(getExactEntries(sourceEntries, subject, difficulty, topic));
  const distractorPool = prioritized.length ? prioritized : getExactEntries(sourceEntries, subject, difficulty, topic);

  const questions = [];

  for (const entry of prioritized) {
    for (const variant of shuffle(buildQuizVariants(entry))) {
      const normalizedPrompt = normalize(variant.prompt);
      if (!normalizedPrompt || usedPrompts.includes(normalizedPrompt)) {
        continue;
      }

      questions.push({
        id: `${entry.subject}-${uid()}`,
        subject: entry.subject,
        difficulty: entry.difficulty,
        topic: entry.topic,
        prompt: variant.prompt,
        correctAnswer: entry.a,
        options: buildDistractors(entry.a, distractorPool),
        rationale: variant.rationale,
        notes: `Topic focus: ${entry.topic}.`,
        userAnswer: null,
      });

      if (questions.length >= count) {
        return questions;
      }
    }
  }

  return questions;
}

function sanitizeFlashcards(cards, subject, difficulty, topic, usedIds, allowRepeat) {
  return uniqueBy(
    (Array.isArray(cards) ? cards : []).map((card) => {
      const nextSubject = card.subject || subject || "Mixed Review";
      const question = String(card.question || card.prompt || "").trim();
      const answer = String(card.answer || "").trim();
      return {
        id: `${nextSubject}-${normalize(question)}`,
        subject: nextSubject,
        difficulty: ["easy", "medium", "hard"].includes(card.difficulty) ? card.difficulty : "medium",
        topic: topic || card.topic || "ai review",
        question,
        answer,
        rationale: String(card.rationale || answer || "Generated by Gemini."),
        notes: String(card.notes || `Topic focus: ${topic || card.topic || "general review"}.`),
      };
    }),
    (card) => card.id
  ).filter(
    (card) =>
      card.question &&
      card.answer &&
      matchesStudyFilter(
        {
          subject: card.subject,
          difficulty: card.difficulty,
          topic: card.topic,
          q: card.question,
          a: card.answer,
          rationale: card.rationale,
        },
        subject,
        difficulty,
        topic
      ) &&
      (allowRepeat ? true : !usedIds.includes(card.id))
  );
}

function sanitizeQuizQuestions(questions, subject, difficulty, topic, usedPrompts, allowRepeat) {
  return uniqueBy(
    (Array.isArray(questions) ? questions : []).map((item) => {
      const prompt = cleanQuizPrompt(item.prompt || item.question || "");
      const options = uniqueBy(
        (Array.isArray(item.options) ? item.options : [])
          .map((option) => cleanQuizOption(option))
          .filter((option) => option && !isInstructionLikeOption(option)),
        (option) => normalize(option)
      );
      const correctAnswer = cleanQuizOption(item.correctAnswer || "");

      return {
        id: item.id || uid(),
        subject: item.subject || subject || "Mixed Review",
        difficulty: ["easy", "medium", "hard"].includes(item.difficulty) ? item.difficulty : "medium",
        topic: topic || item.topic || "ai review",
        prompt,
        correctAnswer,
        options,
        rationale: String(item.rationale || correctAnswer || "").trim(),
        notes: String(item.notes || `Topic focus: ${topic || "general review"}.`),
        userAnswer: item.userAnswer ?? null,
      };
    }),
    (item) => normalize(item.prompt)
  ).filter((item) => {
    const valid = item.prompt && item.prompt.length > 18 && item.correctAnswer && item.options.length >= 4;
    const notUsed = allowRepeat ? true : !usedPrompts.includes(normalize(item.prompt));
    const includesCorrect = item.options.some((option) => normalize(option) === normalize(item.correctAnswer));
    return (
      valid &&
      notUsed &&
      includesCorrect &&
      matchesStudyFilter(
        {
          subject: item.subject,
          difficulty: item.difficulty,
          topic: item.topic,
          prompt: item.prompt,
          answer: item.correctAnswer,
          rationale: item.rationale,
        },
        subject,
        difficulty,
        topic
      )
    );
  });
}

function buildSessionLabel(session) {
  return `${session.subject}${session.topic ? ` - ${session.topic}` : ""} (${session.mode})`;
}

function selectSessionItems(pool, size, usedKeys, recentKeys, keySelector) {
  const distinctPool = uniqueBy(pool, keySelector);
  if (!distinctPool.length) {
    return [];
  }

  const nextUsed = usedKeys.filter((key) => distinctPool.some((item) => keySelector(item) === key));
  const nextRecent = recentKeys.filter((key) => distinctPool.some((item) => keySelector(item) === key));
  const unseen = nextUsed.length >= distinctPool.length
    ? []
    : distinctPool.filter((item) => !nextUsed.includes(keySelector(item)));
  const selected = [];
  const targetSize = Math.max(size, 1);

  function takeDistinct(candidates) {
    for (const item of shuffle(candidates)) {
      const key = keySelector(item);
      if (selected.some((selectedItem) => keySelector(selectedItem) === key)) {
        continue;
      }
      selected.push(item);
      if (selected.length >= targetSize || selected.length >= distinctPool.length) {
        return;
      }
    }
  }

  takeDistinct(unseen.filter((item) => !nextRecent.includes(keySelector(item))));
  if (selected.length < Math.min(targetSize, distinctPool.length)) {
    takeDistinct(unseen);
  }
  if (selected.length < Math.min(targetSize, distinctPool.length)) {
    takeDistinct(distinctPool.filter((item) => !nextRecent.includes(keySelector(item))));
  }
  if (selected.length < Math.min(targetSize, distinctPool.length)) {
    takeDistinct(distinctPool);
  }

  if (selected.length >= targetSize) {
    return selected.slice(0, targetSize);
  }

  while (selected.length < targetSize) {
    const recycledPool = shuffle(distinctPool);

    for (const item of recycledPool) {
      const previous = selected[selected.length - 1];
      if (previous && distinctPool.length > 1 && keySelector(previous) === keySelector(item)) {
        continue;
      }

      selected.push(item);
      if (selected.length >= targetSize) {
        return selected;
      }
    }

    if (distinctPool.length === 1) {
      selected.push(distinctPool[0]);
    }
  }

  return selected.slice(0, targetSize);
}

function RequestModal({
  open,
  onClose,
  onDiscard,
  requestType,
  setRequestType,
  requestName,
  setRequestName,
  requestMessage,
  setRequestMessage,
  onSubmit,
  requestHistory,
  requestStatus,
  requestLoading,
  requestConfigured,
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26, 26, 26, 0.36)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
        zIndex: 120,
      }}
    >
      <div
        style={{
          width: "min(560px, 100%)",
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 22,
          boxShadow: "0 20px 50px rgba(15, 23, 42, 0.18)",
          padding: 22,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Report or Request</div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginTop: 4 }}>
              Send a bug report, topic request, or fix request. When the feedback inbox is configured, this goes to your central GitHub-backed request inbox.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={onClose}
              title="Minimize"
              style={{
                width: 36,
                height: 36,
                border: `1px solid ${C.border}`,
                background: C.surface,
                borderRadius: 10,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: C.muted,
              }}
            >
              <Minus size={16} />
            </button>
            <button
              type="button"
              onClick={onDiscard}
              title="Discard and close"
              style={{
                width: 36,
                height: 36,
                border: `1px solid ${C.border}`,
                background: C.surface,
                borderRadius: 10,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: C.muted,
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: C.muted, fontWeight: 700, display: "block", marginBottom: 6 }}>
              Request Type
            </label>
            <select
              value={requestType}
              onChange={(event) => setRequestType(event.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: "#FBFAF7",
                fontSize: 13,
                outline: "none",
              }}
            >
              {["Bug Report", "Topic Request", "Feature Request", "Content Fix", "General Feedback"].map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: C.muted, fontWeight: 700, display: "block", marginBottom: 6 }}>
              Name
            </label>
            <input
              value={requestName}
              onChange={(event) => setRequestName(event.target.value)}
              placeholder="Optional name"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: "#FBFAF7",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, color: C.muted, fontWeight: 700, display: "block", marginBottom: 6 }}>
            Message
          </label>
          <textarea
            value={requestMessage}
            onChange={(event) => setRequestMessage(event.target.value)}
            placeholder="Describe what should be added, fixed, or improved..."
            style={{
              width: "100%",
              minHeight: 130,
              padding: "12px 14px",
              borderRadius: 14,
              border: `1px solid ${C.border}`,
              background: "#FBFAF7",
              fontSize: 14,
              lineHeight: 1.65,
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {requestStatus ? (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              background: requestConfigured ? C.accentLight : C.amberLight,
              border: `1px solid ${requestConfigured ? C.accentMid : C.amber}`,
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {requestStatus}
          </div>
        ) : null}

        <div
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            background: requestConfigured ? C.accentLight : C.pill,
            border: `1px solid ${requestConfigured ? C.accentMid : C.border}`,
            fontSize: 12,
            color: requestConfigured ? C.accent : C.muted,
          }}
        >
          {requestConfigured
            ? "Central inbox is active. New requests are being sent to the site handler."
            : "Central inbox is not configured yet. Requests will fall back to local device storage until the GitHub feedback token is added."}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: C.muted }}>
            Recent requests saved here: <strong>{requestHistory.length}</strong>
          </div>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!requestMessage.trim() || requestLoading}
            style={{
              padding: "10px 16px",
              borderRadius: 12,
              border: "none",
              background: requestMessage.trim() && !requestLoading ? C.accent : C.border,
              color: requestMessage.trim() && !requestLoading ? "#fff" : C.muted,
              fontWeight: 700,
              cursor: requestMessage.trim() && !requestLoading ? "pointer" : "not-allowed",
            }}
          >
            {requestLoading ? "Submitting..." : "Submit Request"}
          </button>
        </div>

        {requestHistory.length ? (
          <div
            style={{
              borderTop: `1px solid ${C.border}`,
              paddingTop: 14,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: C.muted }}>Recent Request History</div>
            {requestHistory.slice(0, 3).map((entry) => (
              <div
                key={entry.id}
                style={{
                  border: `1px solid ${C.border}`,
                  background: "#FBFAF7",
                  borderRadius: 14,
                  padding: 12,
                }}
              >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{entry.type}</div>
                    <div style={{ fontSize: 11, color: C.faint }}>{new Date(entry.createdAt).toLocaleString()}</div>
                  </div>
                {entry.url ? (
                  <div style={{ fontSize: 11, color: C.accent, marginBottom: 6 }}>
                    <a href={entry.url} target="_blank" rel="noreferrer" style={{ color: C.accent }}>
                      Open request #{entry.number}
                    </a>
                  </div>
                ) : null}
                <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>{entry.message}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TermsModal({ open, onClose }) {
  if (!open) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26, 26, 26, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
        zIndex: 140,
      }}
    >
      <div
        style={{
          width: "min(680px, 100%)",
          maxHeight: "min(86vh, 760px)",
          overflowY: "auto",
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 22,
          boxShadow: "0 20px 50px rgba(15, 23, 42, 0.18)",
          padding: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              CareDrop
            </div>
            <div style={{ marginTop: 6, fontSize: 26, fontWeight: 900, letterSpacing: "-0.04em" }}>
              Terms and Conditions
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              border: `1px solid ${C.border}`,
              background: "#FBFAF7",
              color: C.muted,
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ marginTop: 16, display: "grid", gap: 16, fontSize: 14, lineHeight: 1.8, color: C.text }}>
          <div>
            CareDrop is a study-support platform built to help learners review flashcards, quizzes, uploaded notes, and AI explanations more consistently. By creating an account or signing in, you agree to use the platform responsibly and for educational purposes.
          </div>
          <div>
            <strong>1. Educational use only.</strong> CareDrop is for review, recall practice, and learning support. It does not replace licensed medical judgment, formal instruction, clinical supervision, or emergency decision-making.
          </div>
          <div>
            <strong>2. Accuracy and judgment.</strong> We work to make the study experience reliable, but learners are still responsible for cross-checking important academic, medication, and clinical information with trusted references, instructors, and current guidelines.
          </div>
          <div>
            <strong>3. Account responsibility.</strong> You are responsible for the information you enter, the files you upload, and any activity that takes place while signed in on your device or account.
          </div>
          <div>
            <strong>4. Uploaded material.</strong> Only upload notes, documents, and materials you are allowed to use. Do not upload sensitive patient information, protected health information, or content that violates privacy, law, or school policy.
          </div>
          <div>
            <strong>5. AI-assisted responses.</strong> AI explanations and generated review content are intended to support study sessions, not to function as definitive clinical authority. Use them as guided review support, especially when clarifying mistakes and difficult concepts.
          </div>
          <div>
            <strong>6. Progress and saved work.</strong> CareDrop may store study progress, saved sessions, and settings locally or through connected services such as Supabase when configured. This helps restore continuity across sessions and devices.
          </div>
          <div>
            <strong>7. Respectful use.</strong> Do not use CareDrop to submit abusive content, misuse feedback/reporting tools, interfere with the service, or attempt to access information that is not yours.
          </div>
          <div>
            <strong>8. Platform updates.</strong> Features, content, and integrations may improve over time. Continued use of CareDrop means you accept those changes as part of the platform’s evolution.
          </div>
        </div>

        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "11px 16px",
              borderRadius: 12,
              border: "none",
              background: C.accent,
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function AuthScreen({
  width,
  authMode,
  setAuthMode,
  authName,
  setAuthName,
  authEmail,
  setAuthEmail,
  authPassword,
  setAuthPassword,
  authConfirmPassword,
  setAuthConfirmPassword,
  termsAccepted,
  setTermsAccepted,
  onOpenTerms,
  cloudSyncReady,
  authNotice,
  onDismissNotice,
  authError,
  authLoading,
  forgotPasswordLoading,
  onSubmit,
  onForgotPassword,
}) {
  const isRegister = authMode === "register";
  const stacked = width < 940;
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    setShowPassword(false);
    setShowConfirmPassword(false);
  }, [authMode]);

  function renderPasswordInput({ value, onChange, placeholder, visible, setVisible }) {
    return (
      <div style={{ position: "relative" }}>
        <input
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          type={visible ? "text" : "password"}
          style={{
            width: "100%",
            padding: "12px 46px 12px 14px",
            borderRadius: 14,
            border: `1px solid ${C.border}`,
            background: "#FBFAF7",
            fontSize: 14,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          style={{
            position: "absolute",
            top: "50%",
            right: 10,
            transform: "translateY(-50%)",
            width: 28,
            height: 28,
            borderRadius: 999,
            border: "none",
            background: "transparent",
            color: C.muted,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #F5F2EA 0%, #F8F6F1 100%)",
        padding: width < 640 ? 16 : 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          width: "min(1100px, 100%)",
          display: "grid",
          gridTemplateColumns: stacked ? "1fr" : "minmax(0, 1.1fr) minmax(340px, 440px)",
          gap: 20,
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            background: "linear-gradient(145deg, #112240 0%, #16305C 70%, #214778 100%)",
            borderRadius: 28,
            padding: stacked ? 24 : 34,
            color: "#fff",
            minHeight: stacked ? 420 : 560,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            boxShadow: "0 24px 50px rgba(15, 23, 42, 0.16)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: "auto -60px -70px auto",
              width: 220,
              height: 220,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(139,229,175,0.25) 0%, rgba(139,229,175,0.02) 65%, transparent 70%)",
            }}
          />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.12)",
                  overflow: "hidden",
                }}
              >
                <img src={LOGO_SRC} alt="CareDrop logo" style={{ width: "100%", height: "100%", display: "block" }} />
              </div>
              <div style={{ fontWeight: 800, fontSize: 20 }}>
                Care<span style={{ color: "#8BE5AF" }}>Drop</span>
              </div>
            </div>
            <div style={{ marginTop: 28, fontSize: stacked ? 34 : 46, lineHeight: 1.04, fontWeight: 900, letterSpacing: "-0.05em", maxWidth: 520 }}>
              Study smarter. Learn from mistakes. Build confidence.
            </div>
            <div style={{ marginTop: 18, fontSize: 15, lineHeight: 1.85, color: "rgba(233,239,247,0.84)", maxWidth: 560 }}>
              Continue your flashcards, quizzes, uploads, weak-area review, and saved sessions in one supportive workspace built for real learners preparing for demanding exams.
            </div>
            <div
              style={{
                marginTop: 26,
                display: "grid",
                gap: 12,
                maxWidth: 520,
              }}
            >
              {[
                "Return to saved sessions without losing your review rhythm.",
                "Track weak areas, quiz accuracy, and next recommended actions.",
                "Use AI explanations when you miss an item and need clearer guidance.",
              ].map((message) => (
                <div
                  key={message}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                    padding: "12px 14px",
                    borderRadius: 16,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: "#8BE5AF",
                      marginTop: 6,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(238,243,249,0.9)" }}>{message}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 13, color: "rgba(233,239,247,0.78)", lineHeight: 1.7, maxWidth: 520 }}>
            {cloudSyncReady
              ? "Cloud sync is available, so your progress can follow you across devices once Supabase is connected."
              : "You can still use CareDrop locally today. Free cloud sync becomes available after Supabase keys are added."}
          </div>
        </div>

        <div
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 28,
            padding: 28,
            boxShadow: "0 18px 36px rgba(15, 23, 42, 0.08)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
            {[
              ["login", "Sign In"],
              ["register", "Register"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setAuthMode(value)}
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  borderRadius: 14,
                  border: authMode === value ? "1px solid rgba(23, 43, 77, 0.12)" : `1px solid ${C.border}`,
                  background: authMode === value ? "linear-gradient(135deg, #1A2740 0%, #24385E 100%)" : "#FBFAF7",
                  color: authMode === value ? "#fff" : C.text,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.04em" }}>
            {isRegister ? "Create your learner account" : "Welcome back"}
          </div>
          <div style={{ marginTop: 8, fontSize: 14, color: C.muted, lineHeight: 1.7 }}>
            {isRegister
              ? "Set up your account to save sessions, track progress, and build a review history you can return to."
              : "Pick up where you left off and keep your review momentum moving."}
          </div>

          <div style={{ marginTop: 22, display: "grid", gap: 12 }}>
            {isRegister ? (
              <div>
                <label style={{ fontSize: 12, color: C.muted, fontWeight: 700, display: "block", marginBottom: 6 }}>
                  Name
                </label>
                <input
                  value={authName}
                  onChange={(event) => setAuthName(event.target.value)}
                  placeholder="Your name"
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 14,
                    border: `1px solid ${C.border}`,
                    background: "#FBFAF7",
                    fontSize: 14,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            ) : null}

            <div>
              <label style={{ fontSize: 12, color: C.muted, fontWeight: 700, display: "block", marginBottom: 6 }}>
                Email
              </label>
              <input
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                placeholder="name@example.com"
                type="email"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 14,
                  border: `1px solid ${C.border}`,
                  background: "#FBFAF7",
                  fontSize: 14,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 6 }}>
                <label style={{ fontSize: 12, color: C.muted, fontWeight: 700, display: "block" }}>
                  Password
                </label>
                {!isRegister && cloudSyncReady ? (
                  <button
                    type="button"
                    onClick={onForgotPassword}
                    disabled={authLoading || forgotPasswordLoading}
                    style={{
                      border: "none",
                      background: "transparent",
                      padding: 0,
                      color: C.accent,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: authLoading || forgotPasswordLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    {forgotPasswordLoading ? "Sending reset..." : "Forgot password?"}
                  </button>
                ) : null}
              </div>
              {renderPasswordInput({
                value: authPassword,
                onChange: (event) => setAuthPassword(event.target.value),
                placeholder: "At least 8 characters",
                visible: showPassword,
                setVisible: setShowPassword,
              })}
            </div>

            {isRegister ? (
              <div>
                <label style={{ fontSize: 12, color: C.muted, fontWeight: 700, display: "block", marginBottom: 6 }}>
                  Confirm Password
                </label>
                {renderPasswordInput({
                  value: authConfirmPassword,
                  onChange: (event) => setAuthConfirmPassword(event.target.value),
                  placeholder: "Repeat password",
                  visible: showConfirmPassword,
                  setVisible: setShowConfirmPassword,
                })}
              </div>
            ) : null}
          </div>

          {authNotice ? (
            <div
              style={{
                marginTop: 16,
                padding: "16px 16px 14px",
                borderRadius: 16,
                background: "#F4FBF7",
                border: `1px solid ${C.accentMid}`,
                color: C.text,
              }}
            >
              <div style={{ fontSize: 12, color: C.accent, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {authNotice.title}
              </div>
              <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7 }}>
                {authNotice.body}
              </div>
              <button
                type="button"
                onClick={onDismissNotice}
                style={{
                  marginTop: 12,
                  padding: "9px 12px",
                  borderRadius: 10,
                  border: `1px solid ${C.accentMid}`,
                  background: "#FFFFFF",
                  color: C.accent,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {authNotice.actionLabel || "Continue"}
              </button>
            </div>
          ) : null}

          {authError ? (
            <div
              style={{
                marginTop: 16,
                padding: "11px 13px",
                borderRadius: 14,
                background: C.redLight,
                border: `1px solid ${C.red}`,
                color: C.text,
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              {authError}
            </div>
          ) : null}

          <label
            style={{
              marginTop: 16,
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              fontSize: 13,
              lineHeight: 1.6,
              color: C.text,
            }}
          >
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(event) => setTermsAccepted(event.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              I agree to the{" "}
              <button
                type="button"
                onClick={onOpenTerms}
                style={{
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  color: C.accent,
                  fontWeight: 800,
                  textDecoration: "underline",
                  cursor: "pointer",
                }}
              >
                Terms and Conditions
              </button>{" "}
              and understand that CareDrop is a reviewer tool for study support only.
            </span>
          </label>

          <button
            type="button"
            onClick={onSubmit}
            disabled={authLoading || !termsAccepted}
            style={{
              marginTop: 20,
              padding: "13px 16px",
              borderRadius: 14,
              border: "none",
              background: authLoading || !termsAccepted ? C.border : C.accent,
              color: authLoading || !termsAccepted ? C.muted : "#fff",
              fontWeight: 800,
              fontSize: 14,
              cursor: authLoading || !termsAccepted ? "not-allowed" : "pointer",
            }}
          >
            {authLoading ? "Working..." : isRegister ? "Create Account" : "Sign In"}
          </button>

          <div style={{ marginTop: 14, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
            {cloudSyncReady
              ? "Signed-in learners can restore progress, saved sessions, and recent study state across devices."
              : "Cloud sync will activate after you add the free Supabase project keys in the environment settings."}
          </div>
        </div>
      </div>
    </div>
  );
}

function SavedSessionCard({ session, onOpen, onDelete }) {
  const itemCount = session.questions?.length || session.cards?.length || 0;

  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: 14,
        background: "#FBFAF7",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{buildSessionLabel(session)}</div>
          <div style={{ fontSize: 12, color: C.muted }}>
            {new Date(session.createdAt).toLocaleString()}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {session.saved ? <Badge label="saved" color="green" /> : null}
          <Badge label={`${itemCount} items`} color="blue" />
        </div>
      </div>
      <div style={{ fontSize: 12, color: C.muted }}>{session.sourceLabel}</div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: C.muted }}>
        <div>Score: <strong>{session.score ?? 0}%</strong></div>
        <div>Answered: <strong>{session.answeredCount ?? 0}</strong></div>
        <div>Difficulty: <strong>{session.difficulty}</strong></div>
        <div>Mode: <strong>{session.mode}</strong></div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={() => onOpen(session)}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            background: C.accentLight,
            color: C.accent,
            border: `1px solid ${C.accentMid}`,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Review
        </button>
        <button
          onClick={() => onDelete(session.id)}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            background: C.redLight,
            color: C.red,
            border: `1px solid ${C.red}`,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const width = useWindowWidth();
  const initialUser = loadAuthSession();
  const persisted = initialUser ? loadPersisted(initialUser.id) : null;
  const legacySavedSessions = persisted?.savedQuizSessions || [];
  const persistedRequests = loadRequestPersisted();
  const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [currentUser, setCurrentUser] = useState(initialUser);
  const [authMode, setAuthMode] = useState("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [authNotice, setAuthNotice] = useState(null);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [authReady, setAuthReady] = useState(!supabaseConfigured);
  const [cloudSyncReady, setCloudSyncReady] = useState(supabaseConfigured);
  const [cloudSyncStatus, setCloudSyncStatus] = useState("");
  const [subject, setSubject] = useState("");
  const [difficulty, setDifficulty] = useState(persisted?.difficulty || "All");
  const [topicFilter, setTopicFilter] = useState(persisted?.topicFilter || "");
  const [topicInput, setTopicInput] = useState(persisted?.topicFilter || "");
  const [focusAction, setFocusAction] = useState("flashcard");
  const [mode, setMode] = useState(persisted?.mode || "flashcard");
  const [flashcards, setFlashcards] = useState([]);
  const [cardIdx, setCardIdx] = useState(0);
  const [flashcardSessionRatings, setFlashcardSessionRatings] = useState({});
  const [flashcardSessionSubmitted, setFlashcardSessionSubmitted] = useState(false);
  const [quiz, setQuiz] = useState([]);
  const [quizIdx, setQuizIdx] = useState(0);
  const [selectedQuizOption, setSelectedQuizOption] = useState("");
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [simulationQuestions, setSimulationQuestions] = useState([]);
  const [simulationIdx, setSimulationIdx] = useState(0);
  const [simulationSubmitted, setSimulationSubmitted] = useState(false);
  const [simulationSize, setSimulationSize] = useState(50);
  const [simulationUsedAi, setSimulationUsedAi] = useState(false);
  const [simulationAnswerSheetOpen, setSimulationAnswerSheetOpen] = useState(false);
  const [remediationContext, setRemediationContext] = useState(persisted?.remediationContext || null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [ratings, setRatings] = useState(persisted?.ratings || {});
  const [sessions, setSessions] = useState(persisted?.sessions || 0);
  const [reviewSessions, setReviewSessions] = useState(persisted?.reviewSessions || legacySavedSessions);
  const [usedFlashcardIds, setUsedFlashcardIds] = useState(persisted?.usedFlashcardIds || []);
  const [usedFlashcardQuestions, setUsedFlashcardQuestions] = useState(persisted?.usedFlashcardQuestions || []);
  const [usedQuizPrompts, setUsedQuizPrompts] = useState(persisted?.usedQuizPrompts || []);
  const [recentFlashcardIds, setRecentFlashcardIds] = useState(persisted?.recentFlashcardIds || []);
  const [recentQuizPrompts, setRecentQuizPrompts] = useState(persisted?.recentQuizPrompts || []);
  const [apiLoading, setApiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState("");
  const [apiError, setApiError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusFading, setStatusFading] = useState(false);
  const [question, setQuestion] = useState("");
  const [gentlePush, setGentlePush] = useState(ENCOURAGEMENTS[0]);
  const [noteText, setNoteText] = useState(persisted?.noteText || "");
  const [uploadedText, setUploadedText] = useState(persisted?.uploadedText || "");
  const [uploadedFileName, setUploadedFileName] = useState(persisted?.uploadedFileName || "");
  const [uploadState, setUploadState] = useState("idle");
  const [uploadError, setUploadError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [summaryText, setSummaryText] = useState(
    persisted?.summaryText || "Paste notes or upload a document to generate a reviewer summary."
  );
  const [filterWeakOnly, setFilterWeakOnly] = useState(persisted?.filterWeakOnly || false);
  const [metricHover, setMetricHover] = useState("");
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestType, setRequestType] = useState("Bug Report");
  const [requestName, setRequestName] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [requestStatus, setRequestStatus] = useState("");
  const [requestHistory, setRequestHistory] = useState(persistedRequests);
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestConfigured, setRequestConfigured] = useState(false);
  const [subjectShortcutsOpen, setSubjectShortcutsOpen] = useState(
    persisted?.subjectShortcutsOpen !== false
  );
  const [calendarMonth, setCalendarMonth] = useState(
    persisted?.calendarMonth ? new Date(persisted.calendarMonth) : new Date()
  );
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(
    persisted?.calendarSelectedDate || getDateInputValue()
  );
  const [calendarEvents, setCalendarEvents] = useState(persisted?.calendarEvents || []);
  const [calendarDraftTitle, setCalendarDraftTitle] = useState("");
  const [calendarDraftType, setCalendarDraftType] = useState("Study");
  const [calendarDraftSubject, setCalendarDraftSubject] = useState("");
  const [calendarDraftNote, setCalendarDraftNote] = useState("");
  const [plannerItems, setPlannerItems] = useState(persisted?.plannerItems || []);
  const [plannerTitle, setPlannerTitle] = useState("");
  const [plannerSubject, setPlannerSubject] = useState("");
  const [plannerMode, setPlannerMode] = useState("mixed");
  const [plannerDueDate, setPlannerDueDate] = useState(getDateInputValue());
  const [plannerNotes, setPlannerNotes] = useState("");
  const [adminView, setAdminView] = useState(persisted?.adminView || "overview");

  const usedFlashcardIdsRef = useRef(usedFlashcardIds);
  const usedFlashcardQuestionsRef = useRef(usedFlashcardQuestions);
  const usedQuizPromptsRef = useRef(usedQuizPrompts);
  const recentFlashcardIdsRef = useRef(recentFlashcardIds);
  const recentQuizPromptsRef = useRef(recentQuizPrompts);
  const remoteProgressLoadedRef = useRef(false);
  const lastActivityAtRef = useRef(Date.now());
  const lastActivityPersistedAtRef = useRef(0);

  function applyPersistedSnapshot(snapshot, options = {}) {
    const { restoreSubject = false } = options;

    if (!snapshot) {
      return;
    }

    setSubject(restoreSubject ? snapshot.subject || "" : "");
    setDifficulty(snapshot.difficulty || "All");
    setTopicFilter(snapshot.topicFilter || "");
    setTopicInput(snapshot.topicFilter || "");
    setMode(snapshot.mode || "flashcard");
    setRatings(snapshot.ratings || {});
    setSessions(Number(snapshot.sessions || 0));
    setReviewSessions(snapshot.reviewSessions || snapshot.savedQuizSessions || []);
    setUsedFlashcardIds(snapshot.usedFlashcardIds || []);
    setUsedFlashcardQuestions(snapshot.usedFlashcardQuestions || []);
    setUsedQuizPrompts(snapshot.usedQuizPrompts || []);
    setRecentFlashcardIds(snapshot.recentFlashcardIds || []);
    setRecentQuizPrompts(snapshot.recentQuizPrompts || []);
    setNoteText(snapshot.noteText || "");
    setUploadedText(snapshot.uploadedText || "");
    setUploadedFileName(snapshot.uploadedFileName || "");
    setSummaryText(snapshot.summaryText || "Paste notes or upload a document to generate a reviewer summary.");
    setFilterWeakOnly(Boolean(snapshot.filterWeakOnly));
    setSubjectShortcutsOpen(snapshot.subjectShortcutsOpen !== false);
    setCalendarMonth(snapshot.calendarMonth ? new Date(snapshot.calendarMonth) : new Date());
    setCalendarSelectedDate(snapshot.calendarSelectedDate || getDateInputValue());
    setCalendarEvents(snapshot.calendarEvents || []);
    setPlannerItems(snapshot.plannerItems || []);
    setAdminView(snapshot.adminView || "overview");
    setFlashcards(snapshot.flashcards || []);
    setCardIdx(clamp(Number(snapshot.cardIdx || 0), 0, Math.max((snapshot.flashcards || []).length - 1, 0)));
    setFlashcardSessionRatings(snapshot.flashcardSessionRatings || {});
    setFlashcardSessionSubmitted(Boolean(snapshot.flashcardSessionSubmitted));
    setQuiz(snapshot.quiz || []);
    setQuizIdx(clamp(Number(snapshot.quizIdx || 0), 0, Math.max((snapshot.quiz || []).length - 1, 0)));
    setQuizSubmitted(Boolean(snapshot.quizSubmitted));
    setShowFeedback(Boolean(snapshot.showFeedback));
    setSimulationQuestions(snapshot.simulationQuestions || []);
    setSimulationIdx(clamp(Number(snapshot.simulationIdx || 0), 0, Math.max((snapshot.simulationQuestions || []).length - 1, 0)));
    setSimulationSubmitted(Boolean(snapshot.simulationSubmitted));
    setSimulationSize(SIMULATION_SIZE_OPTIONS.includes(Number(snapshot.simulationSize)) ? Number(snapshot.simulationSize) : 50);
    setSimulationUsedAi(Boolean(snapshot.simulationUsedAi));
    setSimulationAnswerSheetOpen(false);
    setRemediationContext(snapshot.remediationContext || null);
  }

  useEffect(() => {
    usedFlashcardIdsRef.current = usedFlashcardIds;
  }, [usedFlashcardIds]);

  useEffect(() => {
    usedFlashcardQuestionsRef.current = usedFlashcardQuestions;
  }, [usedFlashcardQuestions]);

  useEffect(() => {
    usedQuizPromptsRef.current = usedQuizPrompts;
  }, [usedQuizPrompts]);

  useEffect(() => {
    recentFlashcardIdsRef.current = recentFlashcardIds;
  }, [recentFlashcardIds]);

  useEffect(() => {
    recentQuizPromptsRef.current = recentQuizPrompts;
  }, [recentQuizPrompts]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setGentlePush(ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)]);
    }, 8000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const markOnline = () => setIsOnline(true);
    const markOffline = () => setIsOnline(false);

    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);

    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  useEffect(() => {
    setTermsAccepted(false);
    setAuthError("");
    setAuthNotice(null);
  }, [authMode]);

  useEffect(() => {
    if (!statusMessage) {
      setStatusFading(false);
      return undefined;
    }

    setStatusFading(false);
    const fadeTimer = window.setTimeout(() => setStatusFading(true), 3200);
    const clearTimer = window.setTimeout(() => {
      setStatusMessage("");
      setStatusFading(false);
    }, 4300);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(clearTimer);
    };
  }, [statusMessage]);

  useEffect(() => {
    if (typeof window === "undefined" || !currentUser?.id) {
      return;
    }

    window.localStorage.setItem(
      getProgressStorageKey(currentUser.id),
      JSON.stringify({
        subject,
        difficulty,
        topicFilter,
        mode,
        ratings,
        sessions,
        reviewSessions,
        flashcards,
        cardIdx,
        flashcardSessionRatings,
        flashcardSessionSubmitted,
        quiz,
        quizIdx,
        quizSubmitted,
        showFeedback,
        simulationQuestions,
        simulationIdx,
        simulationSubmitted,
        simulationSize,
        simulationUsedAi,
        remediationContext,
        usedFlashcardIds,
        usedFlashcardQuestions,
        usedQuizPrompts,
        recentFlashcardIds,
        recentQuizPrompts,
        noteText,
        uploadedText,
        uploadedFileName,
        summaryText,
        filterWeakOnly,
        subjectShortcutsOpen,
        calendarMonth: calendarMonth.toISOString(),
        calendarSelectedDate,
        calendarEvents,
        plannerItems,
        adminView,
      })
    );
  }, [
    currentUser?.id,
    subject,
    difficulty,
    topicFilter,
    mode,
    ratings,
    sessions,
    reviewSessions,
    flashcards,
    cardIdx,
    flashcardSessionRatings,
    flashcardSessionSubmitted,
    quiz,
    quizIdx,
    quizSubmitted,
    showFeedback,
    simulationQuestions,
    simulationIdx,
    simulationSubmitted,
    simulationSize,
    simulationUsedAi,
    remediationContext,
    usedFlashcardIds,
    usedFlashcardQuestions,
    usedQuizPrompts,
    recentFlashcardIds,
    recentQuizPrompts,
    noteText,
    uploadedText,
    uploadedFileName,
    summaryText,
    filterWeakOnly,
    subjectShortcutsOpen,
    calendarMonth,
    calendarSelectedDate,
    calendarEvents,
    plannerItems,
    adminView,
  ]);

  useEffect(() => {
    if (!supabaseConfigured || !supabase || !currentUser?.id || currentUser.provider !== "supabase" || !remoteProgressLoadedRef.current) {
      return undefined;
    }

    const payload = {
      subject,
      difficulty,
      topicFilter,
      mode,
      ratings,
      sessions,
      reviewSessions,
      flashcards,
      cardIdx,
      flashcardSessionRatings,
      flashcardSessionSubmitted,
      quiz,
      quizIdx,
      quizSubmitted,
      showFeedback,
      simulationQuestions,
      simulationIdx,
      simulationSubmitted,
      simulationSize,
      simulationUsedAi,
      remediationContext,
      usedFlashcardIds,
      usedFlashcardQuestions,
      usedQuizPrompts,
      recentFlashcardIds,
      recentQuizPrompts,
      noteText,
      uploadedText,
      uploadedFileName,
      summaryText,
      filterWeakOnly,
      subjectShortcutsOpen,
      calendarMonth: calendarMonth.toISOString(),
      calendarSelectedDate,
      calendarEvents,
      plannerItems,
      adminView,
    };

    const timeoutId = window.setTimeout(async () => {
      const { error } = await supabase
        .from("user_progress")
        .upsert(
          {
            user_id: currentUser.id,
            payload,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (error) {
        setCloudSyncStatus("Cloud sync needs the Supabase table setup.");
        return;
      }

      setCloudSyncStatus("Cloud sync active.");
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [
    currentUser?.id,
    currentUser?.provider,
    subject,
    difficulty,
    topicFilter,
    mode,
    ratings,
    sessions,
    reviewSessions,
    flashcards,
    cardIdx,
    flashcardSessionRatings,
    flashcardSessionSubmitted,
    quiz,
    quizIdx,
    quizSubmitted,
    showFeedback,
    simulationQuestions,
    simulationIdx,
    simulationSubmitted,
    simulationSize,
    simulationUsedAi,
    remediationContext,
    usedFlashcardIds,
    usedFlashcardQuestions,
    usedQuizPrompts,
    recentFlashcardIds,
    recentQuizPrompts,
    noteText,
    uploadedText,
    uploadedFileName,
    summaryText,
    filterWeakOnly,
    subjectShortcutsOpen,
    calendarMonth,
    calendarSelectedDate,
    calendarEvents,
    plannerItems,
    adminView,
  ]);

  useEffect(() => {
    if (persisted) {
      applyPersistedSnapshot(persisted);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(REQUEST_STORAGE_KEY, JSON.stringify(requestHistory));
  }, [requestHistory]);

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setAuthReady(true);
      return undefined;
    }

    let active = true;

    async function bootstrapAuth() {
      const { data } = await supabase.auth.getSession();
      if (!active) {
        return;
      }

      if (data.session?.user) {
        const nextUser = mapSupabaseUser(data.session.user);
        setCurrentUser(nextUser);
        saveAuthSession(nextUser);
      } else if (loadAuthSession()?.provider === "supabase") {
        clearAuthSession();
        setCurrentUser(null);
      }

      setCloudSyncReady(true);
      setAuthReady(true);
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) {
        return;
      }

      if (session?.user) {
        const nextUser = mapSupabaseUser(session.user);
        setCurrentUser(nextUser);
        saveAuthSession(nextUser);
      } else if (loadAuthSession()?.provider === "supabase") {
        clearAuthSession();
        setCurrentUser(null);
      }
    });

    bootstrapAuth();

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabaseConfigured || !supabase || !currentUser?.id || currentUser.provider !== "supabase") {
      remoteProgressLoadedRef.current = false;
      return;
    }

    let active = true;

    async function loadRemoteProgress() {
      const { data, error } = await supabase
        .from("user_progress")
        .select("payload")
        .eq("user_id", currentUser.id)
        .maybeSingle();

      if (!active) {
        return;
      }

      if (error) {
        setCloudSyncStatus("Cloud progress table is not ready yet.");
        remoteProgressLoadedRef.current = true;
        return;
      }

      if (data?.payload) {
        applyPersistedSnapshot(data.payload);
        setStatusMessage("Cloud progress restored successfully.");
      }

      setCloudSyncStatus("Cloud sync active.");
      remoteProgressLoadedRef.current = true;
    }

    loadRemoteProgress();

    return () => {
      active = false;
    };
  }, [currentUser?.id, currentUser?.provider]);

  useEffect(() => {
    async function loadCentralRequests() {
      try {
        const data = await getJson("/api/feedback");
        setRequestHistory(Array.isArray(data.requests) ? data.requests : []);
        setRequestConfigured(Boolean(data.configured));
      } catch {
        setRequestConfigured(false);
      }
    }

    loadCentralRequests();
  }, []);

  const studyText = buildStudyText(noteText, uploadedText);
  const hasCustomSource = Boolean(studyText);
  const subjectDisplay = subject || (topicFilter ? "Topic Focus" : "Select a subject");
  const customEntries = useMemo(
    () => (hasCustomSource ? buildCustomEntries(studyText, subject) : []),
    [hasCustomSource, studyText, subject]
  );
  const activeEntries = customEntries.length ? customEntries : getAllEntries();

  const weakCardIds = useMemo(
    () =>
      Object.entries(ratings)
        .filter(([, value]) => value === "again" || value === "hard")
        .map(([key]) => key),
    [ratings]
  );

  const accuracy = useMemo(() => {
    const values = Object.values(ratings);
    const answered = values.filter(Boolean).length;
    const correct = values.filter((value) => value === "easy").length;
    return answered ? Math.round((correct / answered) * 100) : 0;
  }, [ratings]);

  const totalCards = getAllEntries().length;
  const currentCard = flashcards[clamp(cardIdx, 0, Math.max(flashcards.length - 1, 0))];
  const quizItem = quiz[quizIdx];
  const answeredCount = quiz.filter((item) => item.userAnswer !== null).length;
  const correctCount = quiz.filter(
    (item) => item.userAnswer && normalize(item.userAnswer) === normalize(item.correctAnswer)
  ).length;
  const simulationItem = simulationQuestions[simulationIdx];
  const simulationAnsweredCount = simulationQuestions.filter((item) => item.userAnswer !== null).length;
  const simulationCorrectCount = simulationQuestions.filter(
    (item) => item.userAnswer && normalize(item.userAnswer) === normalize(item.correctAnswer)
  ).length;
  const simulationCurrentCorrect =
    !!simulationItem &&
    simulationItem.userAnswer !== null &&
    normalize(simulationItem.userAnswer) === normalize(simulationItem.correctAnswer);
  const simulationProgressPercent = simulationQuestions.length
    ? Math.round((simulationAnsweredCount / simulationQuestions.length) * 100)
    : 0;
  const simulationScore = simulationQuestions.length
    ? Math.round((simulationCorrectCount / simulationQuestions.length) * 100)
    : 0;
  const simulationIncorrectCount = Math.max(simulationQuestions.length - simulationCorrectCount, 0);
  const simulationSubjectBreakdown = useMemo(
    () =>
      Object.values(
        simulationQuestions.reduce((accumulator, item) => {
          const key = item.subject || "Mixed Review";
          if (!accumulator[key]) {
            accumulator[key] = { subject: key, total: 0, correct: 0 };
          }

          accumulator[key].total += 1;
          if (item.userAnswer && normalize(item.userAnswer) === normalize(item.correctAnswer)) {
            accumulator[key].correct += 1;
          }

          return accumulator;
        }, {})
      )
        .map((item) => ({
          ...item,
          percent: item.total ? Math.round((item.correct / item.total) * 100) : 0,
        }))
        .sort((left, right) => right.percent - left.percent),
    [simulationQuestions]
  );
  const simulationStrongSubjects = simulationSubjectBreakdown.filter((item) => item.percent >= 75).slice(0, 3);
  const simulationWeakSubjects = [...simulationSubjectBreakdown]
    .sort((left, right) => left.percent - right.percent)
    .filter((item) => item.percent < 65)
    .slice(0, 3);
  const currentCorrect =
    !!quizItem &&
    quizItem.userAnswer !== null &&
    normalize(quizItem.userAnswer) === normalize(quizItem.correctAnswer);
  const progressPercent = quiz.length ? Math.round((answeredCount / quiz.length) * 100) : 0;
  const flashcardCompletedCount = flashcards.filter((card) => flashcardSessionRatings[card.id]).length;
  const flashcardStrongCount = flashcards.filter((card) => flashcardSessionRatings[card.id] === "easy").length;
  const flashcardNeedsReviewCount = flashcards.filter((card) => {
    const value = flashcardSessionRatings[card.id];
    return value === "again" || value === "hard";
  }).length;
  const flashcardProgressPercent = flashcards.length
    ? Math.round((flashcardCompletedCount / flashcards.length) * 100)
    : 0;
  const reviewSessionAverage = reviewSessions.length
    ? Math.round(reviewSessions.reduce((total, session) => total + Number(session.score || 0), 0) / reviewSessions.length)
    : 0;
  const hasRequestDraft = Boolean(requestName.trim() || requestMessage.trim() || requestStatus);
  const overallAnsweredCount = reviewSessions.reduce((total, session) => total + Number(session.answeredCount || 0), 0);
  const incorrectReviewItems = useMemo(() => collectIncorrectQuestions(reviewSessions), [reviewSessions]);
  const quizSessionCount = reviewSessions.filter((session) => session.mode === "quiz").length;
  const quizAverage = quizSessionCount
    ? Math.round(
        reviewSessions
          .filter((session) => session.mode === "quiz")
          .reduce((total, session) => total + Number(session.score || 0), 0) / quizSessionCount
      )
    : 0;
  const subjectNames = Object.keys(QUESTION_BANK);
  const weakSubjectCounts = weakCardIds.reduce((accumulator, cardId) => {
    const matchedSubject = subjectNames.find((name) => String(cardId || "").startsWith(`${name}-`));
    if (!matchedSubject) {
      return accumulator;
    }

    accumulator[matchedSubject] = (accumulator[matchedSubject] || 0) + 1;
    return accumulator;
  }, {});
  const weakestSubject =
    Object.entries(weakSubjectCounts).sort((left, right) => Number(right[1]) - Number(left[1]))[0]?.[0] || "";
  const subjectPerformanceSummary = useMemo(
    () =>
      Object.values(
        reviewSessions.reduce((accumulator, session) => {
          const key = session.subject || "Mixed Review";
          if (!accumulator[key]) {
            accumulator[key] = { subject: key, attempts: 0, scoreTotal: 0, answered: 0 };
          }

          accumulator[key].attempts += 1;
          accumulator[key].scoreTotal += Number(session.score || 0);
          accumulator[key].answered += Number(session.answeredCount || 0);
          return accumulator;
        }, {})
      )
        .map((item) => ({
          ...item,
          average: item.attempts ? Math.round(item.scoreTotal / item.attempts) : 0,
        }))
        .sort((left, right) => right.average - left.average),
    [reviewSessions]
  );
  const requestTypeSummary = useMemo(
    () =>
      Object.entries(
        requestHistory.reduce((accumulator, item) => {
          const key = item.type || "General Feedback";
          accumulator[key] = (accumulator[key] || 0) + 1;
          return accumulator;
        }, {})
      ).sort((left, right) => Number(right[1]) - Number(left[1])),
    [requestHistory]
  );
  const mostRecentSession = reviewSessions[0] || null;
  const savedSessionWaiting =
    reviewSessions.find((session) => session.saved && session.mode === "quiz") ||
    reviewSessions.find((session) => session.saved);
  const studyStreak = getStudyStreak(reviewSessions);
  const isAdminUser = isAdminEmail(currentUser?.email);
  const savedSessionCount = reviewSessions.filter((session) => session.saved).length;
  const todayKey = getDateKey();
  const todayAnsweredCount = reviewSessions
    .filter((session) => getDateKey(session.createdAt) === todayKey)
    .reduce((total, session) => total + Number(session.answeredCount || 0), 0);
  const dailyGoalTarget = 10;
  const dailyGoalProgress = clamp(Math.round((todayAnsweredCount / dailyGoalTarget) * 100), 0, 100);
  const readinessScore = clamp(
    Math.round((accuracy * 0.4) + (reviewSessionAverage * 0.25) + Math.min(sessions * 3, 20) + Math.min(studyStreak * 4, 15)),
    0,
    100
  );
  const simulationFlaggedCount = simulationQuestions.filter((item) => item.flagged).length;
  const remediationFocusSubject =
    remediationContext?.weakestSubject ||
    simulationWeakSubjects[0]?.subject ||
    weakestSubject ||
    mostRecentSession?.subject ||
    "";
  const isFirstVisit = !reviewSessions.length && !Object.keys(ratings).length;
  const calendarDays = useMemo(
    () => buildCalendarDays(calendarMonth, calendarEvents),
    [calendarMonth, calendarEvents]
  );
  const selectedDateEvents = useMemo(
    () =>
      sortByDateAsc(
        calendarEvents.filter(
          (event) => formatDateKey(event.date || event.dateKey || event.createdAt || new Date()) === calendarSelectedDate
        ),
        "date"
      ),
    [calendarEvents, calendarSelectedDate]
  );
  const upcomingEvents = useMemo(() => getUpcomingEvents(calendarEvents, 5), [calendarEvents]);
  const overduePlannerItems = useMemo(() => getOverduePlannerItems(plannerItems), [plannerItems]);
  const plannerCompletionRate = useMemo(() => getPlannerCompletionRate(plannerItems), [plannerItems]);
  const plannerOpenItems = plannerItems.filter((item) => !item.completed);
  const plannerModeSummary = useMemo(
    () =>
      Object.entries(
        plannerItems.reduce((accumulator, item) => {
          const key = item.mode || "mixed";
          accumulator[key] = (accumulator[key] || 0) + 1;
          return accumulator;
        }, {})
      ).sort((left, right) => Number(right[1]) - Number(left[1])),
    [plannerItems]
  );
  const scheduledSubjectSummary = useMemo(
    () =>
      Object.entries(
        calendarEvents.reduce((accumulator, item) => {
          if (!item.subject) {
            return accumulator;
          }
          accumulator[item.subject] = (accumulator[item.subject] || 0) + 1;
          return accumulator;
        }, {})
      ).sort((left, right) => Number(right[1]) - Number(left[1])),
    [calendarEvents]
  );
  const plannerRecommendedItem =
    sortByDateAsc(
      plannerOpenItems.filter((item) => item.dueDate),
      "dueDate"
    )[0] || plannerOpenItems[0] || null;
  const plannerSummaryLine = plannerRecommendedItem
    ? `${plannerRecommendedItem.title}${plannerRecommendedItem.subject ? ` | ${plannerRecommendedItem.subject}` : ""}`
    : "No active planner items yet";
  const featureUsageSummary = [
    { label: "Flashcard sets", value: reviewSessions.filter((session) => session.mode === "flashcard").length },
    { label: "Quiz sessions", value: reviewSessions.filter((session) => session.mode === "quiz").length },
    { label: "Simulation runs", value: reviewSessions.filter((session) => session.mode === "simulation").length },
    { label: "Planner items", value: plannerItems.length },
    { label: "Calendar events", value: calendarEvents.length },
  ];
  const adminFeedbackItems = useMemo(
    () => sortByDateDesc(requestHistory, "createdAt"),
    [requestHistory]
  );
  const adminRecentSessions = reviewSessions.slice(0, 8);
  const recommendedAction = (() => {
    if (overduePlannerItems.length) {
      const nextOverdue = overduePlannerItems[0];
      return {
        title: "Clear an overdue study target",
        body: `${nextOverdue.title}${nextOverdue.subject ? ` in ${nextOverdue.subject}` : ""} is already past due. Reopen it now so the planner stays useful instead of becoming a guilt list.`,
        cta: "Open planner",
        onClick: () => setMode("planner"),
      };
    }

    if (plannerRecommendedItem) {
      return {
        title: "Follow your next planned review",
        body: `${plannerRecommendedItem.title}${plannerRecommendedItem.subject ? ` in ${plannerRecommendedItem.subject}` : ""}${plannerRecommendedItem.dueDate ? ` is due on ${plannerRecommendedItem.dueDate}` : " is ready now"}. Keeping one promise to yourself today is enough to keep momentum alive.`,
        cta: "Open planner",
        onClick: () => setMode("planner"),
      };
    }

    if (savedSessionWaiting) {
      return {
        title: "Resume a saved review session",
        body: `You already have ${buildSessionLabel(savedSessionWaiting)} waiting. Reopen it and keep your momentum instead of starting from zero.`,
        cta: "Resume saved session",
        onClick: () => openSavedQuiz(savedSessionWaiting),
      };
    }

    if (incorrectReviewItems.length) {
      return {
        title: "Turn recent misses into a recovery set",
        body: remediationFocusSubject
          ? `Your recent wrong answers are clustering around ${remediationFocusSubject}. A short remediation quiz will tighten those weak spots faster than starting broad again.`
          : "You have enough recent misses for a targeted recovery quiz. Use it to revisit what went wrong while the details are still fresh.",
        cta: "Open remediation quiz",
        onClick: () => startRemediationMode(),
      };
    }

    if (weakCardIds.length) {
      return {
        title: "Revisit your weak areas next",
        body: weakestSubject
          ? `${weakSubjectCounts[weakestSubject]} weak cards are stacking up in ${weakestSubject}. A focused pass there will tighten recall fastest.`
          : "Your missed and unsure cards are ready for another pass. A quick weak-card round is the cleanest next step.",
        cta: "Review weak cards",
        onClick: () => {
          setFilterWeakOnly(true);
          setMode("flashcard");
        },
      };
    }

    if (mostRecentSession) {
      return {
        title: `Continue ${mostRecentSession.subject}`,
        body: `Your latest session was ${buildSessionLabel(mostRecentSession)}. Keep the thread going while the topic is still fresh.`,
        cta:
          mostRecentSession.mode === "simulation"
            ? "Resume simulation"
            : mostRecentSession.mode === "quiz"
              ? "Start another quiz"
              : "Open flashcards",
        onClick: () => {
          setSubject(mostRecentSession.subject || subject);
          setDifficulty(mostRecentSession.difficulty || difficulty);
          setTopicFilter(mostRecentSession.topic || "");
          setTopicInput(mostRecentSession.topic || "");
          if (mostRecentSession.mode === "simulation") {
            openSavedQuiz(mostRecentSession);
          } else if (mostRecentSession.mode === "quiz") {
            setMode("quiz");
            if (!quiz.length) {
              generateQuiz();
            }
          } else {
            setMode("flashcard");
            if (!flashcards.length) {
              loadLocalFlashcardSet();
            }
          }
        },
      };
    }

    return {
      title: subject ? "Start your first focused session" : "Choose a subject to begin",
      body: subject
        ? "Open a 10-card flashcard set or a short quiz, then let the dashboard begin tracking your accuracy, streak, and weak areas."
        : "Pick a subject in Review Filters, choose flashcards or quiz, and CareDrop will prepare your first focused set.",
      cta: subject ? "Open flashcards" : "Go to filters",
      onClick: () => {
        if (!subject) {
          setStatusMessage("Choose a subject in Review Filters to start your first session.");
          return;
        }

        setMode("flashcard");
        if (!flashcards.length) {
          loadLocalFlashcardSet();
        }
      },
    };
  })();

  useEffect(() => {
    setAiResponse("");
    setQuestion("");
    setSelectedQuizOption("");
  }, [quizIdx, quiz.length]);

  function clearMessages() {
    setApiError("");
    setStatusMessage("");
    setUploadError("");
  }

  function ensureSubjectSelected(actionLabel = "continue") {
    if (subject) {
      return true;
    }

    setApiError(`Select a subject first before you ${actionLabel}.`);
    return false;
  }

  function ensureReviewTargetSelected(actionLabel, activeTopic = "") {
    if (subject || String(activeTopic || "").trim()) {
      return true;
    }

    setApiError(`Select a subject or enter a topic focus first before you ${actionLabel}.`);
    return false;
  }

  function clearRequestDraft() {
    setRequestType("Bug Report");
    setRequestName("");
    setRequestMessage("");
    setRequestStatus("");
  }

  function resetCalendarDraft() {
    setCalendarDraftTitle("");
    setCalendarDraftType("Study");
    setCalendarDraftSubject("");
    setCalendarDraftNote("");
  }

  function addCalendarEvent() {
    if (!calendarDraftTitle.trim()) {
      setStatusMessage("Add a short title first so the calendar entry is clear.");
      return;
    }

    const nextEvent = {
      id: uid(),
      title: calendarDraftTitle.trim(),
      type: calendarDraftType,
      subject: calendarDraftSubject || "",
      note: calendarDraftNote.trim(),
      date: calendarSelectedDate,
      completed: false,
      createdAt: new Date().toISOString(),
    };

    setCalendarEvents((current) => sortByDateAsc([...current, nextEvent], "date"));
    resetCalendarDraft();
    setStatusMessage("Calendar event saved.");
  }

  function toggleCalendarEvent(eventId) {
    setCalendarEvents((current) =>
      current.map((item) =>
        item.id === eventId ? { ...item, completed: !item.completed } : item
      )
    );
  }

  function deleteCalendarEvent(eventId) {
    setCalendarEvents((current) => current.filter((item) => item.id !== eventId));
    setStatusMessage("Calendar event removed.");
  }

  function addPlannerItem() {
    if (!plannerTitle.trim()) {
      setStatusMessage("Add a planner title first.");
      return;
    }

    const nextItem = {
      id: uid(),
      title: plannerTitle.trim(),
      subject: plannerSubject || "",
      mode: plannerMode,
      dueDate: plannerDueDate || "",
      notes: plannerNotes.trim(),
      completed: false,
      createdAt: new Date().toISOString(),
    };

    setPlannerItems((current) => sortByDateAsc([...current, nextItem], "dueDate"));
    setPlannerTitle("");
    setPlannerSubject("");
    setPlannerMode("mixed");
    setPlannerDueDate(getDateInputValue());
    setPlannerNotes("");
    setStatusMessage("Planner item saved.");
  }

  function togglePlannerItem(itemId) {
    setPlannerItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              completed: !item.completed,
              completedAt: !item.completed ? new Date().toISOString() : null,
            }
          : item
      )
    );
  }

  function deletePlannerItem(itemId) {
    setPlannerItems((current) => current.filter((item) => item.id !== itemId));
    setStatusMessage("Planner item removed.");
  }

  function addPlannerItemToCalendar(item) {
    const nextEvent = {
      id: uid(),
      title: item.title,
      type: item.mode === "simulation" ? "Simulation" : item.mode === "quiz" ? "Quiz" : "Study",
      subject: item.subject || "",
      note: item.notes || "Planned from the CareDrop study planner.",
      date: item.dueDate || getDateInputValue(),
      completed: Boolean(item.completed),
      createdAt: new Date().toISOString(),
    };

    setCalendarEvents((current) => sortByDateAsc([...current, nextEvent], "date"));
    setStatusMessage("Planner item added to the calendar.");
  }

  async function handleForgotPassword() {
    setAuthError("");
    setAuthNotice(null);

    const email = authEmail.trim().toLowerCase();

    if (!supabaseConfigured || !supabase) {
      setAuthError("Password reset becomes available after Supabase is connected.");
      return;
    }

    if (!email) {
      setAuthError("Enter your email first so we know where to send the reset link.");
      return;
    }

    setForgotPasswordLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });

      if (error) {
        throw error;
      }

      setAuthNotice({
        title: "Check your email",
        body: "Password reset instructions were sent. Open the reset link, then return here and sign in with your updated password.",
        actionLabel: "Back to sign in",
      });
      setAuthMode("login");
    } catch (error) {
      setAuthError(normalizeAuthErrorMessage(error, "reset") || "We couldn't send the reset email right now.");
    } finally {
      setForgotPasswordLoading(false);
    }
  }

  async function handleAuthSubmit() {
    setAuthError("");
    setAuthNotice(null);

    const email = authEmail.trim().toLowerCase();
    const password = authPassword;
    const agreed = Boolean(termsAccepted);

    if (!email || !password) {
      setAuthError("Enter your email and password.");
      return;
    }

    if (!agreed) {
      setAuthError("Please accept the Terms and Conditions to continue.");
      return;
    }

    setAuthLoading(true);

    try {
      if (supabaseConfigured && supabase) {
        if (authMode === "register") {
          const name = authName.trim();

          if (!name) {
            throw new Error("Enter your name to create an account.");
          }

          if (password.length < 8) {
            throw new Error("Use at least 8 characters for the password.");
          }

          if (password !== authConfirmPassword) {
            throw new Error("Passwords do not match.");
          }

          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: getAuthRedirectUrl(),
              data: {
                full_name: name,
              },
            },
          });

          if (error) {
            throw error;
          }

          if (data.user) {
            const nextUser = mapSupabaseUser(data.user);
            saveAuthSession(nextUser);
            setCurrentUser(nextUser);
          }

          setAuthName("");
          setAuthEmail("");
          setAuthPassword("");
          setAuthConfirmPassword("");
          setTermsAccepted(false);
          if (data.session && data.user) {
            setStatusMessage("Account created and signed in successfully.");
            applyPersistedSnapshot(loadPersisted(data.user.id));
          } else {
            setAuthMode("login");
            setAuthEmail("");
            setAuthNotice({
              title: "Verify your email",
              body: "Your account was created. If Supabase email confirmation is enabled, open the verification email first, then come back to sign in and continue your review sessions.",
              actionLabel: "Sign in when ready",
            });
            return;
          }
        } else {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (error) {
            throw error;
          }

          const nextUser = mapSupabaseUser(data.user);
          saveAuthSession(nextUser);
          setCurrentUser(nextUser);
          applyPersistedSnapshot(loadPersisted(nextUser.id));
          setStatusMessage("Signed in successfully.");
        }
      } else {
        if (!window.crypto?.subtle) {
          throw new Error("Secure login is not available in this browser.");
        }

        const accounts = loadAccounts();
        const passwordHash = await hashSecret(password);

        if (authMode === "register") {
          const name = authName.trim();

          if (!name) {
            throw new Error("Enter your name to create an account.");
          }

          if (password.length < 8) {
            throw new Error("Use at least 8 characters for the password.");
          }

          if (password !== authConfirmPassword) {
            throw new Error("Passwords do not match.");
          }

          if (accounts.some((account) => String(account.email || "").trim().toLowerCase() === email)) {
            throw new Error("An account with that email already exists.");
          }

          const nextUser = {
            id: uid(),
            name,
            email,
            passwordHash,
            createdAt: new Date().toISOString(),
            provider: "local",
          };

          saveAccounts([...accounts, nextUser]);
          saveAuthSession({ id: nextUser.id, name: nextUser.name, email: nextUser.email, provider: "local" });
          setCurrentUser({ id: nextUser.id, name: nextUser.name, email: nextUser.email, provider: "local" });
          applyPersistedSnapshot(loadPersisted(nextUser.id));
          setAuthName("");
          setAuthEmail("");
          setAuthPassword("");
          setAuthConfirmPassword("");
          setTermsAccepted(false);
          setStatusMessage("Account created and saved on this device.");
        } else {
          const matched = accounts.find((account) => String(account.email || "").trim().toLowerCase() === email);

          if (!matched) {
            throw new Error("Incorrect email or password.");
          }

          if (String(matched.passwordHash || "") !== passwordHash) {
            throw new Error("Incorrect email or password.");
          }

          saveAuthSession({ id: matched.id, name: matched.name, email: matched.email, provider: "local" });
          setCurrentUser({ id: matched.id, name: matched.name, email: matched.email, provider: "local" });
          applyPersistedSnapshot(loadPersisted(matched.id));
          setStatusMessage("Signed in successfully.");
        }
      }

      if (authMode !== "register") {
        setAuthName("");
        setAuthEmail("");
        setAuthPassword("");
        setAuthConfirmPassword("");
        setTermsAccepted(false);
      }
    } catch (error) {
      setAuthError(normalizeAuthErrorMessage(error, authMode) || "Unable to complete sign in right now.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    if (supabaseConfigured && supabase && currentUser?.provider === "supabase") {
      await supabase.auth.signOut();
    }

    clearAuthSession();
    window.location.reload();
  }

  useEffect(() => {
    if (!currentUser) {
      return undefined;
    }

    let signingOut = false;

    const markActivity = () => {
      const now = Date.now();
      lastActivityAtRef.current = now;

      if (now - lastActivityPersistedAtRef.current > 30000) {
        saveAuthSession(currentUser);
        lastActivityPersistedAtRef.current = now;
      }
    };

    const checkActivity = window.setInterval(async () => {
      if (signingOut) {
        return;
      }

      if (Date.now() - lastActivityAtRef.current < AUTH_SESSION_MAX_AGE_MS) {
        return;
      }

      signingOut = true;

      if (supabaseConfigured && supabase && currentUser?.provider === "supabase") {
        await supabase.auth.signOut();
      }

      clearAuthSession();
      setCurrentUser(null);
      setAuthMode("login");
      setAuthPassword("");
      setAuthConfirmPassword("");
      setTermsAccepted(false);
      setAuthNotice({
        title: "Session expired",
        body: "You were signed out after 10 minutes of inactivity. Sign in again to continue where you left off.",
        actionLabel: "Sign in again",
      });
    }, 30000);

    const activityEvents = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, markActivity, { passive: true }));

    markActivity();

    return () => {
      window.clearInterval(checkActivity);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, markActivity));
    };
  }, [currentUser]);

  function markFlashcardsAsUsed(deck) {
    setUsedFlashcardIds((prev) => uniqueBy([...prev, ...deck.map((card) => card.id)], (value) => value));
    setUsedFlashcardQuestions((prev) =>
      uniqueBy([...prev, ...deck.map((card) => normalize(card.question))], (value) => value)
    );
    setRecentFlashcardIds((prev) => [...prev, ...deck.map((card) => card.id)].slice(-RECENT_MEMORY_LIMIT));
  }

  function buildLocalFlashcardSet(activeTopic = topicFilter) {
    let candidates = uniqueBy(
      getExactEntries(activeEntries, subject, difficulty, activeTopic).flatMap((entry) => buildFlashcardVariants(entry)),
      (card) => card.id
    );

    if (filterWeakOnly) {
      candidates = candidates.filter((card) => weakCardIds.includes(card.id));
    }

    return selectSessionItems(
      candidates,
      FLASHCARD_SET_SIZE,
      hasCustomSource ? [] : usedFlashcardIdsRef.current,
      recentFlashcardIdsRef.current,
      (card) => card.id
    );
  }

  function loadLocalFlashcardSet(message, activeTopic = topicFilter) {
    if (!subject && !String(activeTopic || "").trim()) {
      setFlashcards([]);
      setCardIdx(0);
      setFlashcardSessionRatings({});
      setFlashcardSessionSubmitted(false);

      if (message) {
        setStatusMessage("Select a subject or enter a topic focus first to prepare your flashcard set.");
      }

      return;
    }

    const deck = buildLocalFlashcardSet(activeTopic);
    setFlashcards(deck);
    setRemediationContext(null);
    setCardIdx(0);
    setFlashcardSessionRatings({});
    setFlashcardSessionSubmitted(false);
    markFlashcardsAsUsed(deck);

    if (message) {
      setStatusMessage(
        deck.length
          ? message
          : "No card data exists for this exact filter yet. Try another subject or upload a document."
      );
    }
  }

  useEffect(() => {
    loadLocalFlashcardSet("");
  }, [subject, difficulty, filterWeakOnly]);

  async function generateClaudeFlashcards(activeTopic = topicFilter) {
    if (!ensureReviewTargetSelected("generate flashcards", activeTopic)) {
      return;
    }

    clearMessages();

    if (!isOnline) {
      loadLocalFlashcardSet("Offline mode: CareDrop loaded a local flashcard set so you can keep studying.", activeTopic);
      return;
    }

    setApiLoading(true);

    try {
      const data = await postJson("/api/claude/cards", {
        notes: studyText,
        subject,
        topic: activeTopic,
        difficulty: difficulty === "All" ? "mixed" : difficulty,
        count: FLASHCARD_SET_SIZE,
        excludeQuestions: hasCustomSource
          ? []
          : usedFlashcardQuestionsRef.current,
      });

      const aiCards = sanitizeFlashcards(
        data.cards,
        subject,
        difficulty,
        activeTopic,
        usedFlashcardIdsRef.current,
        hasCustomSource
      );
      const needed = Math.max(0, FLASHCARD_SET_SIZE - aiCards.length);
      const fallback = needed
        ? buildLocalFlashcardSet(activeTopic)
            .filter((card) => !aiCards.some((item) => item.id === card.id))
            .slice(0, needed)
        : [];
      const aiNeeded = activeTopic && deckLowOnTopicFocus(aiCards, needed);
      const deck = [...aiCards, ...fallback].slice(0, FLASHCARD_SET_SIZE);

      setFlashcards(deck);
      setRemediationContext(null);
      setCardIdx(0);
      setMode("flashcard");
      setFlashcardSessionRatings({});
      setFlashcardSessionSubmitted(false);
      markFlashcardsAsUsed(deck);
      setStatusMessage(
        deck.length >= FLASHCARD_SET_SIZE
          ? activeTopic
            ? aiNeeded
              ? `Gemini expanded a fresh ${FLASHCARD_SET_SIZE}-card focus set for ${activeTopic}.`
              : `Gemini generated another ${FLASHCARD_SET_SIZE}-card focus set for ${activeTopic}.`
            : "Gemini generated a fresh 10-card flashcard set."
          : `Gemini returned ${deck.length} cards for this focus.`
      );
    } catch (error) {
      setApiError(error.message || "Gemini flashcards failed. Using local cards instead.");
      loadLocalFlashcardSet("Gemini flashcards were unavailable, so the local deck was loaded.", activeTopic);
    } finally {
      setApiLoading(false);
    }
  }

  function deckLowOnTopicFocus(aiCards, needed) {
    return aiCards.length < FLASHCARD_SET_SIZE || needed > 0;
  }

  async function requestQuizBatch(activeTopic, count, excludePrompts = [], options = {}) {
    const {
      subjectOverride = subject,
      difficultyOverride = difficulty === "All" ? "mixed" : difficulty,
      examMode = false,
      examLength = count,
      topicOverride = activeTopic,
    } = options;

    const data = await postJson("/api/claude/quiz", {
      notes: studyText,
      subject: subjectOverride,
      topic: topicOverride,
      difficulty: difficultyOverride,
      count,
      excludeQuestions: excludePrompts,
      examMode,
      examLength,
    });

    return sanitizeQuizQuestions(
      data.questions,
      subjectOverride,
      difficultyOverride === "mixed" ? "All" : difficultyOverride,
      topicOverride,
      [],
      true
    );
  }

  async function generateQuiz(activeTopic = topicFilter) {
    if (!ensureReviewTargetSelected("generate a quiz", activeTopic)) {
      return;
    }

    clearMessages();
    if (!isOnline) {
      const fallbackPool = buildLocalQuizFallback(
        activeEntries,
        subject,
        difficulty,
        activeTopic,
        QUIZ_SET_SIZE,
        []
      );
      const fallback = selectSessionItems(
        fallbackPool,
        QUIZ_SET_SIZE,
        hasCustomSource ? [] : usedQuizPromptsRef.current,
        recentQuizPromptsRef.current,
        (item) => normalize(item.prompt)
      );
      setQuiz(fallback);
      setQuizIdx(0);
      setMode("quiz");
      setShowFeedback(false);
      setQuizSubmitted(false);
      setStatusMessage("Offline mode: CareDrop prepared a local 10-question quiz from the stored review bank.");
      return;
    }

    setApiLoading(true);
    setShowFeedback(false);
    setQuizSubmitted(false);

    try {
      const aiQuestions = await requestQuizBatch(
        activeTopic,
        QUIZ_SET_SIZE,
        hasCustomSource ? [] : usedQuizPromptsRef.current
      );
      const fallback = buildLocalQuizFallback(
        activeEntries,
        subject,
        difficulty,
        activeTopic,
        QUIZ_SET_SIZE - aiQuestions.length,
        []
      );
      const questions = selectSessionItems(
        [...aiQuestions, ...fallback],
        QUIZ_SET_SIZE,
        hasCustomSource ? [] : usedQuizPromptsRef.current,
        recentQuizPromptsRef.current,
        (item) => normalize(item.prompt)
      );

      setQuiz(questions);
      setRemediationContext(null);
      setQuizIdx(0);
      setMode("quiz");
      setStatusMessage(
        questions.length >= QUIZ_SET_SIZE
          ? activeTopic
            ? aiQuestions.length < QUIZ_SET_SIZE
              ? `Gemini expanded a fresh ${QUIZ_SET_SIZE}-question focus quiz for ${activeTopic}.`
              : `Gemini generated another ${QUIZ_SET_SIZE}-question focus quiz for ${activeTopic}.`
            : "A fresh 10-question quiz is ready for review."
          : `Loaded ${questions.length} questions for this focus.`
      );

      if (!hasCustomSource) {
        setUsedQuizPrompts((prev) =>
          uniqueBy(
            [...prev, ...questions.map((item) => normalize(item.prompt))],
            (value) => value
          )
        );
        setRecentQuizPrompts((prev) =>
          [...prev, ...questions.map((item) => normalize(item.prompt))].slice(-RECENT_MEMORY_LIMIT)
        );
      }
    } catch (error) {
      const fallbackPool = buildLocalQuizFallback(
        activeEntries,
        subject,
        difficulty,
        activeTopic,
        QUIZ_SET_SIZE,
        []
      );
      const fallback = selectSessionItems(
        fallbackPool,
        QUIZ_SET_SIZE,
        hasCustomSource ? [] : usedQuizPromptsRef.current,
        recentQuizPromptsRef.current,
        (item) => normalize(item.prompt)
      );
      setQuiz(fallback);
      setRemediationContext(null);
      setQuizIdx(0);
      setMode("quiz");
      setApiError(
        error.message || "Gemini quiz generation failed. A local 10-question backup quiz has been loaded."
      );
      if (!hasCustomSource) {
        setUsedQuizPrompts((prev) =>
          uniqueBy(
            [...prev, ...fallback.map((item) => normalize(item.prompt))],
            (value) => value
          )
        );
        setRecentQuizPrompts((prev) =>
          [...prev, ...fallback.map((item) => normalize(item.prompt))].slice(-RECENT_MEMORY_LIMIT)
        );
      }
    } finally {
      setApiLoading(false);
    }
  }

  async function generateSimulationExam(targetSize = simulationSize, activeTopic = topicFilter) {
    const finalTarget = SIMULATION_SIZE_OPTIONS.includes(Number(targetSize)) ? Number(targetSize) : 50;
    const simulationSubject = "Mixed Review";
    const simulationDifficulty = "mixed";
    const simulationTopic = "";
    const maxAiQuestions = finalTarget >= 500 ? 120 : finalTarget >= 100 ? 60 : 40;
    const aiBatchCap = Math.ceil(maxAiQuestions / SIMULATION_BATCH_SIZE);
    clearMessages();
    setApiLoading(true);
    setSimulationSubmitted(false);
    setSimulationUsedAi(false);

    try {
      const localPool = selectSessionItems(
        buildLocalQuizFallback(
          activeEntries,
          "",
          "All",
          "",
          Math.max(finalTarget, 60),
          []
        ),
        finalTarget,
        hasCustomSource ? [] : usedQuizPromptsRef.current,
        recentQuizPromptsRef.current,
        (item) => normalize(item.prompt)
      );

      let combined = [...localPool];
      const shouldAskAi = isOnline && Boolean(activeTopic || hasCustomSource || combined.length < finalTarget);

      if (shouldAskAi) {
        const maxBatches = Math.min(Math.ceil(finalTarget / SIMULATION_BATCH_SIZE), aiBatchCap);

        for (let batchIndex = 0; batchIndex < maxBatches && combined.length < finalTarget; batchIndex += 1) {
          const requestedCount = Math.min(SIMULATION_BATCH_SIZE, finalTarget - combined.length);
          const aiBatch = await requestQuizBatch(
            simulationTopic,
            requestedCount,
            uniqueBy(
              [...combined.map((item) => item.prompt), ...(hasCustomSource ? [] : usedQuizPromptsRef.current)],
              (value) => normalize(value)
            ),
            {
              subjectOverride: simulationSubject,
              difficultyOverride: simulationDifficulty,
              examMode: true,
              examLength: finalTarget,
              topicOverride: simulationTopic,
            }
          );

          if (!aiBatch.length) {
            break;
          }

          combined = uniqueBy([...combined, ...aiBatch], (item) => normalize(item.prompt));
        }
      }

      const questions = selectSessionItems(
        combined,
        finalTarget,
        hasCustomSource ? [] : usedQuizPromptsRef.current,
        recentQuizPromptsRef.current,
        (item) => normalize(item.prompt)
      );

      setSimulationQuestions(questions);
      setRemediationContext(null);
      setSimulationIdx(0);
      setSimulationSize(finalTarget);
      setSimulationSubmitted(false);
      setMode("simulation");
      setSimulationUsedAi(combined.length > localPool.length);
      setSimulationAnswerSheetOpen(false);
      setStatusMessage(
        combined.length > localPool.length
          ? `Simulation exam ready. Gemini helped shape this mixed ${finalTarget}-question exam.`
          : `Simulation exam ready. Your mixed ${finalTarget}-question exam is prepared.`
      );

      if (!hasCustomSource) {
        setUsedQuizPrompts((prev) =>
          uniqueBy(
            [...prev, ...questions.map((item) => normalize(item.prompt))],
            (value) => value
          )
        );
        setRecentQuizPrompts((prev) =>
          [...prev, ...questions.map((item) => normalize(item.prompt))].slice(-RECENT_MEMORY_LIMIT)
        );
      }
    } catch (error) {
      const fallback = selectSessionItems(
        buildLocalQuizFallback(
          activeEntries,
          "",
          "All",
          "",
          Math.max(finalTarget, 60),
          []
        ),
        finalTarget,
        hasCustomSource ? [] : usedQuizPromptsRef.current,
        recentQuizPromptsRef.current,
        (item) => normalize(item.prompt)
      );

      setSimulationQuestions(fallback);
      setRemediationContext(null);
      setSimulationIdx(0);
      setSimulationSize(finalTarget);
      setSimulationSubmitted(false);
      setMode("simulation");
      setSimulationUsedAi(false);
      setSimulationAnswerSheetOpen(false);
      setApiError(normalizeAiErrorMessage(error) || `Gemini simulation generation failed. A local ${finalTarget}-question simulation was loaded instead.`);
      setStatusMessage(`Loaded a mixed ${finalTarget}-question simulation from the CareDrop bank.`);
    } finally {
      setApiLoading(false);
    }
  }

  async function generateSummary() {
    const notes = studyText.trim();
    if (!notes) {
      setApiError("Add notes or upload a file before asking Gemini for a summary.");
      return;
    }

    clearMessages();

    if (!isOnline) {
      setSummaryText(buildLocalSummary(notes));
      setStatusMessage("Offline mode: CareDrop built a local reviewer summary from your notes.");
      return;
    }

    setApiLoading(true);

    try {
      const data = await postJson("/api/claude/summary", { notes });
      setSummaryText(data.summary || buildLocalSummary(notes));
      setStatusMessage("Gemini generated a reviewer summary from your notes.");
    } catch (error) {
      setSummaryText(buildLocalSummary(notes));
      setApiError(error.message || "Gemini summary failed. A local reviewer summary was generated instead.");
    } finally {
      setApiLoading(false);
    }
  }

  async function askClaude() {
    if (!question.trim() || !quizItem || currentCorrect || quizItem.userAnswer === null) {
      return;
    }

    clearMessages();
    if (!isOnline) {
      setApiError("AI review help needs an internet connection. You can still use the rationale and memory tip for this item.");
      setAiResponse("");
      return;
    }

    setApiLoading(true);
    setAiResponse("");

    try {
      const data = await postJson("/api/claude/review-help", {
        userPrompt: question,
        question: quizItem?.prompt,
        selectedAnswer: quizItem?.userAnswer,
        correctAnswer: quizItem?.correctAnswer,
        rationale: quizItem?.rationale,
        notes: quizItem?.notes,
        subject: quizItem?.subject || subject,
        topic: quizItem?.topic || topicFilter,
        difficulty: quizItem?.difficulty || difficulty,
      });

      setAiResponse(
        data.response ||
          "The AI did not return a full explanation, but the correct answer and rationale above are still the best review guide for this item."
      );
      setQuestion("");
    } catch (error) {
      setApiError(
        error.message || "AI assistant is unavailable right now. You can still review the flashcards."
      );
      setAiResponse("");
    } finally {
      setApiLoading(false);
    }
  }

  function recordReviewSession(session) {
    setReviewSessions((prev) => [session, ...prev.filter((item) => item.id !== session.id)].slice(0, 18));
  }

  function submitFlashcardSession() {
    if (!flashcards.length || flashcardCompletedCount < flashcards.length || flashcardSessionSubmitted) {
      return;
    }

    const session = {
      id: uid(),
      createdAt: new Date().toISOString(),
      mode: "flashcard",
      subject,
      difficulty,
      topic: topicFilter,
      sourceLabel: remediationContext
        ? `Remediation set${remediationContext.weakestSubject ? ` for ${remediationContext.weakestSubject}` : ""}`
        : hasCustomSource
          ? uploadedFileName || "Focused notes session"
          : "Generated from CareDrop subject bank",
      cards: flashcards,
      currentIndex: cardIdx,
      cardRatings: flashcardSessionRatings,
      score: flashcards.length ? Math.round((flashcardStrongCount / flashcards.length) * 100) : 0,
      answeredCount: flashcardCompletedCount,
      correctCount: flashcardStrongCount,
      weakCount: flashcardNeedsReviewCount,
    };

    recordReviewSession(session);
    setFlashcardSessionSubmitted(true);
    setSessions((value) => value + 1);
    setStatusMessage("Flashcard session submitted and added to your review history.");
  }

  function submitQuizSession() {
    if (!quiz.length || answeredCount < quiz.length || quizSubmitted) {
      return;
    }

    const session = {
      id: uid(),
      createdAt: new Date().toISOString(),
      mode: "quiz",
      subject,
      difficulty,
      topic: topicFilter,
      sourceLabel: remediationContext
        ? `Remediation set${remediationContext.weakestSubject ? ` for ${remediationContext.weakestSubject}` : ""}`
        : hasCustomSource
          ? uploadedFileName || "Focused notes session"
          : "Generated from CareDrop subject bank",
      questions: quiz,
      currentIndex: quizIdx,
      score: quiz.length ? Math.round((correctCount / quiz.length) * 100) : 0,
      answeredCount,
      correctCount,
    };

    recordReviewSession(session);
    setQuizSubmitted(true);
    setSessions((value) => value + 1);
    setStatusMessage("Quiz session submitted and added to your review history.");
  }

  function handleRate(key) {
    if (!currentCard) {
      return;
    }

    setFlashcardSessionRatings((prev) => ({
      ...prev,
      [currentCard.id]: key,
    }));
    setRatings((prev) => ({
      ...prev,
      [currentCard.id]: key,
    }));

    if (cardIdx < flashcards.length - 1) {
      setCardIdx((value) => value + 1);
      return;
    }
  }

  function handleQuizAnswer(option) {
    if (!quizItem || quizItem.userAnswer !== null) {
      return;
    }

    setSelectedQuizOption(option);
  }

  function handleSimulationAnswer(option) {
    if (!simulationItem || simulationSubmitted) {
      return;
    }

    setSimulationQuestions((prev) =>
      prev.map((item, index) =>
        index === simulationIdx
          ? {
              ...item,
              userAnswer: option,
            }
          : item
      )
    );
  }

  function toggleSimulationFlag() {
    if (!simulationItem || simulationSubmitted) {
      return;
    }

    setSimulationQuestions((prev) =>
      prev.map((item, index) =>
        index === simulationIdx
          ? {
              ...item,
              flagged: !item.flagged,
            }
          : item
      )
    );
  }

  function submitQuizAnswer() {
    if (!quizItem || quizItem.userAnswer !== null || !selectedQuizOption) {
      return;
    }

    setQuiz((prev) =>
      prev.map((item, index) =>
        index === quizIdx
          ? {
              ...item,
              userAnswer: selectedQuizOption,
            }
          : item
      )
    );
    setShowFeedback(true);
  }

  function saveCurrentQuiz() {
    if (!quiz.length) {
      return;
    }

    const score = quiz.length ? Math.round((correctCount / quiz.length) * 100) : 0;

    const session = {
      id: uid(),
      createdAt: new Date().toISOString(),
      mode: "quiz",
      subject,
      difficulty,
      topic: topicFilter,
      sourceLabel: hasCustomSource
        ? uploadedFileName || "Focused notes session"
        : "Generated from CareDrop subject bank",
      questions: quiz,
      currentIndex: quizIdx,
      score,
      answeredCount,
      saved: true,
    };

    setReviewSessions((prev) => [session, ...prev].slice(0, 18));
    setStatusMessage("Quiz session saved. You can reopen it from Review History.");
  }

  function openSavedQuiz(session) {
    setRemediationContext(null);

    if (session.mode === "flashcard") {
      setFlashcards(session.cards || []);
      setCardIdx(clamp(session.currentIndex || 0, 0, Math.max((session.cards || []).length - 1, 0)));
      setFlashcardSessionRatings(session.cardRatings || {});
      setFlashcardSessionSubmitted(true);
      setMode("flashcard");
      setStatusMessage(`Loaded review session: ${buildSessionLabel(session)}.`);
      return;
    }

    if (session.mode === "simulation") {
      setSimulationQuestions(session.questions || []);
      setSimulationIdx(clamp(session.currentIndex || 0, 0, Math.max((session.questions || []).length - 1, 0)));
      setSimulationSubmitted(true);
      setSimulationSize(SIMULATION_SIZE_OPTIONS.includes(Number(session.simulationSize)) ? Number(session.simulationSize) : 50);
      setSimulationUsedAi(Boolean(session.usedAi));
      setSimulationAnswerSheetOpen(false);
      setMode("simulation");
      setStatusMessage(`Loaded saved session: ${buildSessionLabel(session)}.`);
      return;
    }

    setQuiz(session.questions || []);
    setQuizIdx(clamp(session.currentIndex || 0, 0, Math.max((session.questions || []).length - 1, 0)));
    setShowFeedback(false);
    setQuizSubmitted(true);
    setMode("quiz");
    setStatusMessage(`Loaded saved session: ${buildSessionLabel(session)}.`);
  }

  function submitSimulationExam() {
    if (!simulationQuestions.length || simulationAnsweredCount < simulationQuestions.length || simulationSubmitted) {
      return;
    }

    const session = {
      id: uid(),
      createdAt: new Date().toISOString(),
      mode: "simulation",
      subject: "Mixed Review",
      difficulty: "mixed",
      topic: "",
      sourceLabel: simulationUsedAi
        ? "Simulation built from the CareDrop bank with Gemini support"
        : "Simulation built from the CareDrop review bank",
      questions: simulationQuestions,
      currentIndex: simulationIdx,
      score: simulationQuestions.length ? Math.round((simulationCorrectCount / simulationQuestions.length) * 100) : 0,
      answeredCount: simulationAnsweredCount,
      correctCount: simulationCorrectCount,
      simulationSize,
      usedAi: simulationUsedAi,
    };

    recordReviewSession(session);
    setSimulationSubmitted(true);
    setSimulationAnswerSheetOpen(false);
    setStatusMessage("Simulation submitted. Your full result is now saved in Review History.");
  }

  function deleteSavedQuiz(sessionId) {
    setReviewSessions((prev) => prev.filter((session) => session.id !== sessionId));
  }

  function startRemediationMode(sourceSession = null) {
    clearMessages();

    const baseSession =
      sourceSession ||
      reviewSessions.find((session) =>
        ["simulation", "quiz"].includes(session.mode) &&
        Number(session.correctCount || 0) < Number(session.answeredCount || 0)
      ) ||
      mostRecentSession;

    const incorrectItems = baseSession?.questions
      ? baseSession.questions
          .filter((item) => item.userAnswer && normalize(item.userAnswer) !== normalize(item.correctAnswer))
          .map((item) => ({
            subject: item.subject || baseSession.subject || "",
            topic: item.topic || baseSession.topic || "",
            prompt: item.prompt || "",
          }))
      : incorrectReviewItems;

    const remediationEntries = buildRemediationEntries(activeEntries, incorrectItems, weakestSubject);
    const targetedSubject =
      (baseSession?.subject && baseSession.subject !== "Mixed Review" ? baseSession.subject : "") ||
      weakestSubject ||
      "";
    const targetedTopic =
      incorrectItems.find((item) => item.topic)?.topic ||
      topicFilter ||
      "";

    const questions = selectSessionItems(
      buildLocalQuizFallback(
        remediationEntries,
        targetedSubject,
        "All",
        targetedTopic,
        QUIZ_SET_SIZE * 2,
        []
      ),
      QUIZ_SET_SIZE,
      [],
      [],
      (item) => normalize(item.prompt)
    );

    if (!questions.length) {
      setApiError("CareDrop could not build a remediation set from the current weak areas yet.");
      return;
    }

    setQuiz(
      questions.map((item) => ({
        ...item,
        notes: `${item.notes} Remediation focus: revisit why the safest answer wins for this topic.`,
      }))
    );
    setQuizIdx(0);
    setSelectedQuizOption("");
    setShowFeedback(false);
    setQuizSubmitted(false);
    setMode("quiz");
    setRemediationContext({
      sourceSessionId: baseSession?.id || "",
      weakestSubject: targetedSubject || remediationEntries[0]?.subject || "",
      topic: targetedTopic,
      createdAt: new Date().toISOString(),
    });
    setStatusMessage(
      targetedSubject
        ? `Remediation mode is ready. This quiz focuses on the areas you missed most in ${targetedSubject}.`
        : "Remediation mode is ready. This quiz focuses on the questions and topics you missed most recently."
    );
  }

  function resetRotation() {
    setUsedFlashcardIds([]);
    setUsedFlashcardQuestions([]);
    setUsedQuizPrompts([]);
    setRecentFlashcardIds([]);
    setRecentQuizPrompts([]);
    setStatusMessage("Flashcard and quiz rotation history was cleared.");
    loadLocalFlashcardSet("Fresh local flashcards loaded after reset.");
  }

  function removeUploadedSource() {
    setUploadedFileName("");
    setUploadedText("");
    setUploadState("idle");
    setUploadError("");
    setSummaryText(noteText.trim() ? buildLocalSummary(noteText) : "Paste notes or upload a document to generate a reviewer summary.");
    setStatusMessage("Attached file was removed. You can upload a new one anytime.");
  }

  async function handleIncomingFile(file) {
    if (!file) {
      return;
    }

    const extension = `.${file.name.split(".").pop()?.toLowerCase() || ""}`;
    if (!SUPPORTED_UPLOAD_EXTENSIONS.includes(extension)) {
      setUploadState("failed");
      setUploadError("Unsupported file type. Upload DOC, DOCX, PDF, JPG, JPEG, PNG, WEBP, or TXT.");
      return;
    }

    clearMessages();

    if (!isOnline && extension !== ".txt") {
      setUploadState("failed");
      setUploadError("You are offline right now. DOC, PDF, and image extraction need a connection. TXT files can still be loaded locally.");
      return;
    }

    setUploadState("uploading");

    try {
      const data = await uploadFileForExtraction(file);
      setUploadedFileName(data.fileName || file.name);
      setUploadedText(data.text || "");
      setSummaryText(buildLocalSummary(data.text || ""));
      setUploadState("success");
      setStatusMessage(`${file.name} uploaded and extracted successfully.`);
    } catch (error) {
      if (extension === ".txt") {
        try {
          const localText = await readTextFileLocally(file);
          setUploadedFileName(file.name);
          setUploadedText(localText);
          setSummaryText(buildLocalSummary(localText));
          setUploadState("success");
          setStatusMessage(`${file.name} loaded locally while the upload service was unavailable.`);
          setUploadError("");
          return;
        } catch (localError) {
          setUploadState("failed");
          setUploadError(localError.message || error.message || "Upload failed.");
          return;
        }
      }

      setUploadState("failed");
      setUploadError(error.message || "Upload failed.");
    }
  }

  function handleFileUpload(event) {
    handleIncomingFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragActive(false);
    handleIncomingFile(event.dataTransfer?.files?.[0]);
  }

  function handleDragOver(event) {
    event.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    setDragActive(false);
  }

  async function submitRequest() {
    if (!requestMessage.trim()) {
      return;
    }

    const fallbackEntry = {
      id: uid(),
      type: requestType,
      submittedBy: requestName.trim() || currentUser?.name || currentUser?.email || "Anonymous",
      message: requestMessage.trim(),
      createdAt: new Date().toISOString(),
      state: "local",
      url: "",
    };

    setRequestLoading(true);
    setRequestStatus("");

    try {
      const data = await postJson("/api/feedback", {
        type: requestType,
        name: requestName.trim() || currentUser?.name || currentUser?.email || "",
        message: requestMessage.trim(),
        appContext: `Submitted from CareDrop | subject=${subject || "none-selected"} | difficulty=${difficulty} | topic=${topicFilter || "none"}`,
      });

      setRequestHistory((prev) => [data.request, ...prev].slice(0, 20));
      setRequestConfigured(true);
      setRequestStatus(
        data.request?.url
          ? `Request submitted to the central inbox. Issue #${data.request.number} was created.`
          : "Request submitted to the central inbox."
      );
    } catch (error) {
      setRequestHistory((prev) => [fallbackEntry, ...prev].slice(0, 20));
      setRequestConfigured(false);
      setRequestStatus(
        `${error.message || "Central request inbox is not configured yet."} The request was saved locally on this device for now.`
      );
    } finally {
      setRequestLoading(false);
      clearRequestDraft();
      setRequestModalOpen(false);
    }
  }

  async function submitReviewFocus() {
    clearMessages();

    const nextTopic = topicInput.trim();
    if (!ensureReviewTargetSelected(`open ${focusAction === "quiz" ? "a quiz" : "flashcards"}`, nextTopic)) {
      return;
    }

    setTopicFilter(nextTopic);

    if (focusAction === "quiz") {
      setMode("quiz");
      await generateQuiz(nextTopic);
      return;
    }

    setMode("flashcard");

    if (nextTopic || hasCustomSource) {
      await generateClaudeFlashcards(nextTopic);
      return;
    }

    loadLocalFlashcardSet("Your next flashcard set is prepared.", nextTopic);
  }

  const bentoItems = [
    {
      title: String(totalCards),
      description: "Total Cards",
      icon: "POOL",
      status: "local high-yield bank",
      hoverText: `${flashcards.length} cards currently loaded in this session`,
      actionLabel: "Open flashcards",
      onClick: () => setMode("flashcard"),
      tags: ["Study"],
      colSpan: 1,
    },
    {
      title: `${accuracy}%`,
      description: "Accuracy",
      icon: "AC",
      status: Object.keys(ratings).length ? `${Object.keys(ratings).length} cards rated` : "start reviewing",
      hoverText: `${Object.values(ratings).filter((value) => value === "easy").length} strong, ${weakCardIds.length} weak`,
      actionLabel: metricHover === "accuracy" ? "Tap again to close detail" : "Tap for rating detail",
      onClick: () => setMetricHover(metricHover === "accuracy" ? "" : "accuracy"),
      tags: ["Progress"],
      colSpan: 1,
    },
    {
      title: String(weakCardIds.length),
      description: "Weak Cards",
      icon: "WK",
      status: weakCardIds.length ? "needs another pass" : "looking good",
      hoverText: weakCardIds.length ? "Click to open weak-card review" : "No weak cards right now",
      actionLabel: weakCardIds.length ? "Open weak review" : "",
      onClick: () => {
        setFilterWeakOnly(true);
        setMode("flashcard");
      },
      tags: ["Review"],
      colSpan: 1,
    },
    {
      title: String(reviewSessions.length),
      description: "Review Sessions",
      icon: "SAVE",
      status: reviewSessions.length ? `${reviewSessionAverage}% average score` : "nothing reviewed yet",
      hoverText: reviewSessions.length
        ? `${reviewSessions[0].subject} latest review | ${reviewSessions[0].score || 0}%`
        : "Submit a session to start tracking progress",
      actionLabel: reviewSessions.length ? "Open review history" : "",
      onClick: () => setMetricHover(metricHover === "sessions" ? "" : "sessions"),
      tags: ["Sessions"],
      colSpan: 1,
    },
    {
      title: "Daily Boost",
      description: gentlePush,
      icon: "GO",
      status: hasCustomSource ? "focused source mode" : "standard subject mode",
      tags: ["Encouragement"],
      colSpan: 2,
      interactive: false,
    },
  ];

  const selectStyle = {
    padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${C.border}`,
    background: C.surface,
    fontSize: 13,
    color: C.text,
    outline: "none",
    cursor: "pointer",
    width: "100%",
    boxSizing: "border-box",
  };

  const panelStyle = {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 20,
    padding: width < 640 ? 18 : 24,
    boxShadow: "0 10px 22px rgba(15, 23, 42, 0.04)",
  };

  const dashboardGreeting = getGreeting(currentUser?.name);
  const isMobile = width < 640;
  const isNarrowTablet = width < 820;

  if (!authReady) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: C.bg,
          fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
          color: C.text,
        }}
      >
        Restoring your study space...
      </div>
    );
  }

  if (!currentUser) {
    return (
      <>
        <AuthScreen
          width={width}
          authMode={authMode}
          setAuthMode={setAuthMode}
          authName={authName}
          setAuthName={setAuthName}
          authEmail={authEmail}
          setAuthEmail={setAuthEmail}
          authPassword={authPassword}
          setAuthPassword={setAuthPassword}
          authConfirmPassword={authConfirmPassword}
          setAuthConfirmPassword={setAuthConfirmPassword}
          termsAccepted={termsAccepted}
          setTermsAccepted={setTermsAccepted}
          onOpenTerms={() => setTermsModalOpen(true)}
          cloudSyncReady={cloudSyncReady}
          authNotice={authNotice}
          onDismissNotice={() => setAuthNotice(null)}
          authError={authError}
          authLoading={authLoading}
          forgotPasswordLoading={forgotPasswordLoading}
          onSubmit={handleAuthSubmit}
          onForgotPassword={handleForgotPassword}
        />
        <TermsModal open={termsModalOpen} onClose={() => setTermsModalOpen(false)} />
      </>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
        color: C.text,
      }}
    >
      <nav
        style={{
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
          padding: isMobile ? "10px 14px" : "0 24px",
          minHeight: isMobile ? 72 : 62,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexDirection: isMobile ? "column" : "row",
          gap: isMobile ? 10 : 0,
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: C.accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              overflow: "hidden",
            }}
          >
            <img
              src={LOGO_SRC}
              alt="CareDrop logo"
              style={{
                width: "100%",
                height: "100%",
                display: "block",
              }}
            />
          </div>
          <span style={{ fontWeight: 800, fontSize: 18 }}>
            Care<span style={{ color: C.accent }}>Drop</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: isMobile ? "flex-start" : "flex-end", width: isMobile ? "100%" : "auto" }}>
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              background: "#F6F3ED",
              border: `1px solid ${C.border}`,
              fontSize: 12,
              fontWeight: 700,
              color: C.text,
            }}
          >
            {currentUser.name}
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: `1px solid ${C.border}`,
              background: C.surface,
              color: C.muted,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Sign Out
          </button>
        </div>
      </nav>

      <div
        style={{
          maxWidth: 1220,
          margin: "0 auto",
          padding: isMobile ? "16px 12px 28px" : "28px 20px 36px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {apiError ? (
          <div
            style={{
              ...panelStyle,
              padding: 16,
              borderColor: C.red,
              background: C.redLight,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, color: C.red }}>
              Action Needed
            </div>
            <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.7, color: C.text }}>
              {apiError}
            </div>
            {apiError && apiError.includes("Render") ? (
              <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>
                Your frontend can load on Vercel, but the Express API needs Render or another Node host unless you convert it to serverless functions.
              </div>
            ) : null}
          </div>
        ) : null}

        {!isOnline ? (
          <div
            style={{
              ...panelStyle,
              padding: 16,
              borderColor: "#C7D6E5",
              background: "#EEF4FB",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, color: "#17355E" }}>
              Offline Review Mode
            </div>
            <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.7, color: C.text }}>
              CareDrop can still load local flashcards, quizzes, saved sessions, and your review history while offline. AI generation, upload extraction, and cloud sync will resume automatically when your connection returns.
            </div>
          </div>
        ) : null}

        <style>
          {`
            @keyframes caredropFadeSlide {
              from {
                opacity: 0;
                transform: translateY(10px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
          `}
        </style>

        <div
          style={{
            ...panelStyle,
            padding: width < 900 ? 20 : 24,
            background: "linear-gradient(135deg, #152645 0%, #0E1C36 62%, #13294A 100%)",
            color: "#FFFFFF",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: "auto -120px -110px auto",
              width: 280,
              height: 280,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(90,214,125,0.24) 0%, rgba(90,214,125,0) 68%)",
            }}
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: width < 980 ? "1fr" : "minmax(0, 1.4fr) minmax(280px, 360px)",
              gap: 20,
              marginBottom: 18,
              position: "relative",
              zIndex: 1,
            }}
          >
            <div style={{ maxWidth: 560 }}>
              <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(225,233,247,0.64)", fontWeight: 800 }}>
                CareDrop Command Center
              </div>
              <div style={{ marginTop: 10, fontSize: 16, color: "#BFE4FF", fontWeight: 700 }}>
                {dashboardGreeting}
              </div>
              <div style={{ marginTop: 10, fontSize: width < 880 ? 30 : 38, lineHeight: 1.08, fontWeight: 900, letterSpacing: "-0.06em" }}>
                Review workspace built to guide your next move.
              </div>
              <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.8, color: "rgba(228,235,246,0.84)" }}>
                Keep your flashcards, quizzes, uploads, saved sessions, and weak-area review in one calm place that helps you decide what to do next.
              </div>
              <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={{ padding: "10px 14px", borderRadius: 999, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 12, color: "rgba(234,241,249,0.88)" }}>
                  {studyStreak ? `${studyStreak}-day study streak` : "Start a streak with one session today"}
                </div>
                <div style={{ padding: "10px 14px", borderRadius: 999, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 12, color: "rgba(234,241,249,0.88)" }}>
                  {mostRecentSession ? `Last studied ${mostRecentSession.subject}` : "Your first session will start the tracker"}
                </div>
              </div>
            </div>
            <div
              style={{
                borderRadius: 24,
                padding: "18px 18px 16px",
                background: "linear-gradient(180deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.04) 100%)",
                border: "1px solid rgba(255,255,255,0.09)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                minHeight: 170,
              }}
            >
              <div>
                <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(228,235,246,0.62)", fontWeight: 800 }}>
                  Encouragement
                </div>
                <div style={{ marginTop: 14, fontSize: 22, lineHeight: 1.45, fontWeight: 700, color: "#FFFFFF" }}>
                  {gentlePush}
                </div>
              </div>
              <div style={{ marginTop: 18, fontSize: 13, lineHeight: 1.7, color: "rgba(225,233,247,0.78)" }}>
                {isFirstVisit
                  ? "Start one short set today and CareDrop will begin building your study trail."
                  : recommendedAction.body}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: width < 1180 ? "1fr" : "240px minmax(0, 1fr)",
              gap: 20,
              alignItems: "center",
              position: "relative",
              zIndex: 1,
            }}
          >
            <ProgressRing
              value={clamp(Math.round(((Object.keys(ratings).length + reviewSessions.reduce((total, session) => total + Number(session.answeredCount || 0), 0)) / Math.max(totalCards * 0.55, 1)) * 100), 0, 100)}
              label="overall completion"
              caption={isFirstVisit ? "Ready when you are." : "Your next set is prepared."}
              size={isMobile ? 156 : 190}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : width < 780 ? "1fr 1fr" : "repeat(4, minmax(0, 1fr))",
                gap: 10,
              }}
            >
              <HeroMetric label="Readiness Score" value={`${readinessScore}%`} helper={weakCardIds.length ? `${weakCardIds.length} weak cards worth revisiting` : isFirstVisit ? "Complete one short session to begin scoring" : "Building confidence steadily"} accent="#F8D56C" />
              <HeroMetric label="Study Streak" value={studyStreak || 0} helper={studyStreak ? "Keep the rhythm going today" : "One session starts the streak"} accent="#8BE5AF" />
              <HeroMetric label="Average Quiz Score" value={`${quizAverage}%`} helper={quizSessionCount ? `${quizSessionCount} quiz sessions tracked` : "Your quiz trend will appear here"} accent="#6BC0FF" />
              <HeroMetric label="Answered Overall" value={overallAnsweredCount} helper={mostRecentSession ? `Last reviewed ${mostRecentSession.subject}` : "Answer one set to start tracking"} accent="#D8B4FE" />
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: width < 960 ? "1fr" : "minmax(280px, 300px) minmax(0, 1fr)",
            gap: 20,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ ...panelStyle, padding: 18, background: "#FCFBF8" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.faint, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Study Command Center
              </div>
              <div style={{ marginTop: 6, fontSize: 13, color: C.muted, lineHeight: 1.65 }}>
                Choose your workspace, set your filters, and jump straight into the right review block without hunting around the page.
              </div>

              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
                  Workspace
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <SidebarNavButton active={mode === "dashboard"} label="Dashboard" hint="Overview and next steps" onClick={() => setMode("dashboard")} />
                  <SidebarNavButton active={mode === "flashcard"} label="Flashcards" hint="Focused card review" badge={flashcards.length || ""} onClick={() => setMode("flashcard")} />
                  <SidebarNavButton active={mode === "quiz"} label="Quiz" hint="Board-style drills" badge={quiz.length || ""} onClick={() => setMode("quiz")} />
                  <SidebarNavButton active={mode === "simulation"} label="Simulation Exam" hint="Mixed 50-500 item exam mode" badge={simulationQuestions.length || ""} onClick={() => setMode("simulation")} />
                  <SidebarNavButton active={mode === "calendar"} label="Calendar" hint="Study schedule and date notes" badge={upcomingEvents.length || ""} onClick={() => setMode("calendar")} />
                  <SidebarNavButton active={mode === "planner"} label="Planner" hint="Goals, due dates, and next study targets" badge={plannerOpenItems.length || ""} onClick={() => setMode("planner")} />
                  <SidebarNavButton active={mode === "notes"} label="Notes & Upload" hint="Files, summaries, and AI" onClick={() => setMode("notes")} />
                  <SidebarNavButton active={mode === "history"} label="Review History" hint="Saved sessions and returns" badge={reviewSessions.length || ""} onClick={() => setMode("history")} />
                  {isAdminUser ? (
                    <SidebarNavButton
                      active={mode === "admin"}
                      label="Admin"
                      hint="Feedback, trends, and product signals"
                      badge={requestHistory.length || ""}
                      onClick={() => setMode("admin")}
                    />
                  ) : null}
                </div>
              </div>

              <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
                  Review Filters
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <label style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>Difficulty</label>
                  <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} style={selectStyle}>
                    {DIFFICULTIES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>

                  <label style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>Subject</label>
                  <select value={subject} onChange={(event) => setSubject(event.target.value)} style={selectStyle}>
                    <option value="">Select a subject</option>
                    {SUBJECT_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>

                  <label style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>Topic Focus</label>
                  <input
                    value={topicInput}
                    onChange={(event) => setTopicInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        submitReviewFocus();
                      }
                    }}
                    placeholder="cardiac drugs, dengue, delegation..."
                    style={{
                      ...selectStyle,
                      cursor: "text",
                    }}
                  />

                  <label style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>Preferred Action</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[
                      ["flashcard", "Flashcards"],
                      ["quiz", "Quiz"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFocusAction(value)}
                        style={{
                          padding: "11px 12px",
                          borderRadius: 12,
                          border: focusAction === value ? `1px solid ${C.accentMid}` : `1px solid ${C.border}`,
                          background: focusAction === value ? C.accentLight : C.surface,
                          color: focusAction === value ? C.accent : C.text,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={submitReviewFocus}
                    disabled={apiLoading}
                    style={{
                      marginTop: 4,
                      padding: "11px 14px",
                      borderRadius: 12,
                      border: "none",
                      background: apiLoading ? C.border : C.accent,
                      color: apiLoading ? C.muted : "#fff",
                      fontWeight: 800,
                      cursor: apiLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    {apiLoading
                      ? "Preparing..."
                      : `Generate ${focusAction === "quiz" ? "Quiz" : "Flashcards"}`}
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
                <button
                  type="button"
                  onClick={() => setSubjectShortcutsOpen((value) => !value)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      Subject Shortcuts
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, color: C.faint }}>
                      Quick jump between major review areas
                    </div>
                  </div>
                  <div style={{ fontSize: 18, color: C.muted, fontWeight: 700 }}>
                    {subjectShortcutsOpen ? "▾" : "▸"}
                  </div>
                </button>

                {subjectShortcutsOpen ? (
                  <div
                    style={{
                      marginTop: 14,
                      display: "grid",
                      gap: 8,
                      maxHeight: 300,
                      overflowY: "auto",
                      paddingRight: 4,
                    }}
                  >
                    {SUBJECT_OPTIONS.map((value) => (
                      <button
                        key={value}
                        onClick={() => {
                          setSubject(value);
                          setMode("flashcard");
                        }}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 12px",
                          borderRadius: 14,
                          border: `1px solid ${subject === value ? "#C4D6EA" : C.border}`,
                          background: subject === value ? "#EEF4FB" : "#FBFAF7",
                          color: subject === value ? "#17355E" : C.text,
                          fontSize: 13,
                          fontWeight: subject === value ? 800 : 700,
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 999,
                            background: subject === value ? C.accent : "#CDD5DF",
                            flexShrink: 0,
                          }}
                        />
                        <span>{value}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px solid ${C.border}`, display: "grid", gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Review Tools
                </div>
                <button
                  onClick={() => setFilterWeakOnly((value) => !value)}
                  style={{
                    padding: "11px 14px",
                    borderRadius: 12,
                    border: filterWeakOnly ? `1px solid ${C.red}` : `1px solid ${C.border}`,
                    background: filterWeakOnly ? C.redLight : C.surface,
                    color: filterWeakOnly ? C.red : C.text,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {filterWeakOnly ? "Showing Weak Cards Only" : "Focus Weak Cards"}
                </button>
                {savedSessionWaiting ? (
                  <button
                    type="button"
                    onClick={() => openSavedQuiz(savedSessionWaiting)}
                    style={{
                      padding: "11px 14px",
                      borderRadius: 12,
                      border: `1px solid #C7D6E5`,
                      background: "#EEF4FB",
                      color: "#17355E",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Resume Saved Session
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => startRemediationMode()}
                  disabled={!incorrectReviewItems.length && !weakCardIds.length}
                  style={{
                    padding: "11px 14px",
                    borderRadius: 12,
                    border: `1px solid ${C.border}`,
                    background: incorrectReviewItems.length || weakCardIds.length ? "#F3FBF6" : C.border,
                    color: incorrectReviewItems.length || weakCardIds.length ? C.accent : C.muted,
                    fontWeight: 700,
                    cursor: incorrectReviewItems.length || weakCardIds.length ? "pointer" : "not-allowed",
                  }}
                >
                  {incorrectReviewItems.length || weakCardIds.length ? "Start Remediation Set" : "Remediation unlocks after misses"}
                </button>
              </div>

              <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px solid ${C.border}`, display: "grid", gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  System Status
                </div>
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: isOnline ? "#F3FBF6" : "#EEF4FB",
                    border: `1px solid ${isOnline ? "#B9E3CA" : "#C7D6E5"}`,
                    fontSize: 13,
                    lineHeight: 1.7,
                    color: C.text,
                  }}
                >
                  <strong>{isOnline ? "Online" : "Offline"}</strong>
                  {" · "}
                  {cloudSyncStatus || (cloudSyncReady ? "Cloud sync standing by." : "Cloud sync not connected yet.")}
                </div>
                {remediationContext ? (
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: 12,
                      background: C.surface,
                      border: `1px solid ${C.border}`,
                      fontSize: 12,
                      lineHeight: 1.7,
                      color: C.muted,
                    }}
                  >
                    Latest remediation focus: <strong style={{ color: C.text }}>{remediationContext.weakestSubject || remediationContext.topic || "mixed weak areas"}</strong>
                  </div>
                ) : null}
              </div>
            </div>

            {weakCardIds.length ? (
              <div
                style={{
                  ...panelStyle,
                  background: C.redLight,
                  borderColor: C.red,
                  padding: 16,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, color: C.red }}>Weak Area Insight</div>
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, marginTop: 6 }}>
                  {weakestSubject
                    ? `${weakCardIds.length} cards still need another pass, with the heaviest pull in ${weakestSubject}.`
                    : `${weakCardIds.length} cards still need another pass.`}
                </div>
              </div>
            ) : null}

          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {mode === "dashboard" ? (
              <AnalyticsCard
                title="Dashboard Overview"
                footer={
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => setMode("flashcard")}
                      style={{
                        padding: "10px 16px",
                        borderRadius: 12,
                        border: "none",
                        background: C.accent,
                        color: "#fff",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      Open Flashcards
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode("quiz");
                        if (!quiz.length) {
                          generateQuiz();
                        }
                      }}
                      style={{
                        padding: "10px 16px",
                        borderRadius: 12,
                        border: `1px solid ${C.border}`,
                        background: C.surface,
                        color: C.text,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      Start Quiz
                    </button>
                  </div>
                }
              >
                <div style={{ display: "grid", gap: 16 }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: width < 980 ? "1fr" : "minmax(0, 1.15fr) minmax(280px, 0.85fr)",
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        borderRadius: 20,
                        padding: 20,
                        border: "1px solid #D8E3EF",
                        background: "linear-gradient(180deg, #F7FBFF 0%, #F1F6FB 100%)",
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Next Best Step
                      </div>
                      <div style={{ marginTop: 10, fontSize: 26, fontWeight: 900, letterSpacing: "-0.05em", color: "#17355E" }}>
                        {recommendedAction.title}
                      </div>
                      <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.8, color: C.text }}>
                        {recommendedAction.body}
                      </div>
                      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={recommendedAction.onClick}
                          style={{
                            padding: "11px 16px",
                            borderRadius: 12,
                            border: "none",
                            background: C.accent,
                            color: "#fff",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          {recommendedAction.cta}
                        </button>
                        {mostRecentSession ? (
                          <div style={{ padding: "11px 14px", borderRadius: 12, background: "#FFFFFF", border: `1px solid ${C.border}`, fontSize: 13, color: C.muted }}>
                            Last session: {buildSessionLabel(mostRecentSession)}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: 20,
                        padding: 20,
                        border: `1px solid ${C.border}`,
                        background: "#FCFBF8",
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Today&apos;s Rhythm
                      </div>
                      <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, color: C.text, fontWeight: 700 }}>
                            <span>Daily goal progress</span>
                            <span>{todayAnsweredCount}/{dailyGoalTarget}</span>
                          </div>
                          <div style={{ marginTop: 8, height: 10, borderRadius: 999, background: "#E8E4DC", overflow: "hidden" }}>
                            <div style={{ width: `${dailyGoalProgress}%`, height: "100%", background: "linear-gradient(90deg, #3D7E64 0%, #7CCB9C 100%)" }} />
                          </div>
                        </div>
                        <div style={{ fontSize: 14, lineHeight: 1.8, color: C.text }}>
                          {todayAnsweredCount
                            ? `You already answered ${todayAnsweredCount} items today. ${todayAnsweredCount >= dailyGoalTarget ? "Goal reached — anything extra is bonus review." : "One more short session will move the bar forward."}`
                            : "No activity logged yet today. A short set is enough to restart your rhythm."}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                          <div style={{ padding: "12px 14px", borderRadius: 14, background: "#FFFFFF", border: `1px solid ${C.border}` }}>
                            <div style={{ fontSize: 11, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                              Study streak
                            </div>
                            <div style={{ marginTop: 8, fontSize: 24, fontWeight: 900 }}>{studyStreak || 0} day{studyStreak === 1 ? "" : "s"}</div>
                          </div>
                          <div style={{ padding: "12px 14px", borderRadius: 14, background: "#FFFFFF", border: `1px solid ${C.border}` }}>
                            <div style={{ fontSize: 11, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                              Recent activity
                            </div>
                            <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6, fontWeight: 700 }}>
                              {mostRecentSession ? getLocalDateLabel(mostRecentSession.createdAt) : "No recent activity yet"}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: width < 980 ? "1fr" : "repeat(4, minmax(0, 1fr))",
                      gap: 14,
                    }}
                  >
                    {[
                      {
                        key: "accuracy",
                        title: "Accuracy",
                        value: `${accuracy}%`,
                        helper: Object.keys(ratings).length ? `${Object.keys(ratings).length} cards rated so far` : "Complete a set to start tracking",
                        body: Object.keys(ratings).length
                          ? `${Object.values(ratings).filter((value) => value === "easy").length} strong responses are already sticking.`
                          : "Your flashcard confidence and quick wins will start appearing here after your first session.",
                      },
                      {
                        key: "weak",
                        title: "Weak Area Insight",
                        value: weakCardIds.length,
                        helper: weakCardIds.length
                          ? weakestSubject
                            ? `${weakestSubject} needs the most support right now`
                            : "A few concepts still need another pass"
                          : "No weak-card backlog at the moment",
                        body: weakCardIds.length
                          ? "Use Focus Weak Cards to review the items you missed or marked as unsure without restarting everything."
                          : "Once you start rating cards, CareDrop will surface the topics that deserve another pass.",
                      },
                      {
                        key: "history",
                        title: "Review History",
                        value: reviewSessions.length,
                        helper: mostRecentSession ? `${mostRecentSession.subject} was your latest subject` : "Your completed sessions will live here",
                        body: mostRecentSession
                          ? `Latest result: ${mostRecentSession.score || 0}% in ${buildSessionLabel(mostRecentSession)}.`
                          : "Submit a flashcard or quiz session once, and CareDrop will start building your review trail.",
                      },
                    ].map((item) => {
                      const active = metricHover === item.key;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setMetricHover(active ? "" : item.key)}
                          style={{
                            borderRadius: 18,
                            padding: 18,
                            border: `1px solid ${active ? "#BFD1E5" : C.border}`,
                            background: active ? "#F2F7FB" : "#FCFBF8",
                            textAlign: "left",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                            {item.title}
                          </div>
                          <div style={{ marginTop: 10, fontSize: 34, fontWeight: 900, letterSpacing: "-0.05em" }}>{item.value}</div>
                          <div style={{ marginTop: 6, fontSize: 13, color: C.muted }}>{item.helper}</div>
                          {active ? (
                            <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.7, color: C.text }}>
                              {item.body}
                            </div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: width < 980 ? "1fr" : "repeat(3, minmax(0, 1fr))",
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        border: `1px solid ${C.border}`,
                        background: "#FCFBF8",
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Retention
                      </div>
                      <div style={{ marginTop: 10, fontSize: 24, fontWeight: 900, letterSpacing: "-0.04em" }}>
                        {savedSessionWaiting ? "Resume is ready" : "Stay in rhythm"}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7, color: C.text }}>
                        {savedSessionWaiting
                          ? `You still have ${buildSessionLabel(savedSessionWaiting)} waiting. Reopening saved work is one of the easiest ways to keep your review streak healthy.`
                          : studyStreak
                            ? `You are on a ${studyStreak}-day streak. One more short set today protects that rhythm.`
                            : "No streak yet. One completed session today is enough to start a steady review pattern."}
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        border: `1px solid ${C.border}`,
                        background: "#FCFBF8",
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Remediation
                      </div>
                      <div style={{ marginTop: 10, fontSize: 24, fontWeight: 900, letterSpacing: "-0.04em" }}>
                        {incorrectReviewItems.length || weakCardIds.length ? "Weak-area recovery ready" : "Build it after your first misses"}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7, color: C.text }}>
                        {incorrectReviewItems.length || weakCardIds.length
                          ? `${incorrectReviewItems.length || weakCardIds.length} review misses are available to turn into a fresh remediation quiz, with extra emphasis on ${remediationFocusSubject || "your weakest subjects"}.`
                          : "Once quiz or simulation misses begin to appear, CareDrop can turn them into a short recovery set instead of making you search manually."}
                      </div>
                      {incorrectReviewItems.length || weakCardIds.length ? (
                        <button
                          type="button"
                          onClick={() => startRemediationMode()}
                          style={{
                            marginTop: 14,
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: "none",
                            background: C.accent,
                            color: "#fff",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          Open remediation quiz
                        </button>
                      ) : null}
                    </div>

                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        border: `1px solid ${C.border}`,
                        background: "#FCFBF8",
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {isAdminUser ? "Admin Snapshot" : "CareDrop Snapshot"}
                      </div>
                        <div style={{ marginTop: 10, display: "grid", gap: 8, fontSize: 13, color: C.text }}>
                          <div><strong>{reviewSessions.length}</strong> tracked sessions in this dashboard</div>
                          <div><strong>{requestHistory.length}</strong> request/report items saved</div>
                          <div><strong>{savedSessionWaiting ? 1 : 0}</strong> saved session waiting to reopen</div>
                          <div><strong>{isOnline ? "Online" : "Offline"}</strong> system state | {cloudSyncStatus || "Cloud sync standing by"}</div>
                        </div>
                      </div>

                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        border: `1px solid ${C.border}`,
                        background: "#FCFBF8",
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Planning
                      </div>
                      <div style={{ marginTop: 10, fontSize: 24, fontWeight: 900, letterSpacing: "-0.04em" }}>
                        {plannerOpenItems.length ? plannerOpenItems.length : 0} active
                      </div>
                      <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7, color: C.text }}>
                        {plannerRecommendedItem
                          ? `Next due: ${plannerSummaryLine}${plannerRecommendedItem.dueDate ? ` on ${plannerRecommendedItem.dueDate}` : ""}.`
                          : "No active planner items yet. Build a study plan so CareDrop can surface what to tackle next."}
                      </div>
                      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => setMode("planner")}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: "none",
                            background: C.accent,
                            color: "#fff",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          Open planner
                        </button>
                        <button
                          type="button"
                          onClick={() => setMode("calendar")}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: `1px solid ${C.border}`,
                            background: C.surface,
                            color: C.text,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Open calendar
                        </button>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      borderRadius: 20,
                      padding: 18,
                      border: `1px solid ${C.border}`,
                      background: "#FCFBF8",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Recent Review Trail
                        </div>
                        <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.7, color: C.muted }}>
                          {reviewSessions.length
                            ? "Pick up a recent session or use it to decide what to revisit next."
                            : "Once you submit a quiz or flashcard set, your review trail will start here."}
                        </div>
                      </div>
                      {reviewSessions.length ? (
                        <button
                          type="button"
                          onClick={() => setMode("history")}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: `1px solid ${C.border}`,
                            background: "#FFFFFF",
                            color: C.text,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Open history
                        </button>
                      ) : null}
                    </div>
                    {reviewSessions.length ? (
                      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                        {reviewSessions.slice(0, 3).map((session) => (
                          <button
                            key={session.id}
                            type="button"
                            onClick={() => openSavedQuiz(session)}
                            style={{
                              width: "100%",
                              borderRadius: 16,
                              padding: "14px 16px",
                              border: `1px solid ${C.border}`,
                              background: "#FFFFFF",
                              display: "flex",
                              justifyContent: "space-between",
                              flexDirection: isMobile ? "column" : "row",
                              gap: 16,
                              alignItems: isMobile ? "flex-start" : "center",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{buildSessionLabel(session)}</div>
                              <div style={{ marginTop: 4, fontSize: 12, color: C.muted }}>{getLocalDateLabel(session.createdAt)}</div>
                            </div>
                            <div style={{ fontSize: 13, color: C.accent, fontWeight: 800 }}>{session.score || 0}%</div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </AnalyticsCard>
            ) : null}

            {mode === "admin" && isAdminUser ? (
              <AnalyticsCard title="Admin Overview">
                <div style={{ display: "grid", gap: 16 }}>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    {[
                      ["overview", "Overview"],
                      ["feedback", "Feedback"],
                      ["planning", "Planning"],
                      ["activity", "Activity"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setAdminView(value)}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 12,
                          border: adminView === value ? `1px solid ${C.accentMid}` : `1px solid ${C.border}`,
                          background: adminView === value ? C.accentLight : "#FCFBF8",
                          color: adminView === value ? C.accent : C.text,
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: width < 980 ? "1fr" : "repeat(4, minmax(0, 1fr))",
                      gap: 14,
                    }}
                  >
                    {[
                      {
                        label: "Tracked Sessions",
                        value: reviewSessions.length,
                        helper: reviewSessions.length ? `${reviewSessionAverage}% average session score` : "No sessions tracked yet",
                      },
                      {
                        label: "Saved Sessions",
                        value: savedSessionCount,
                        helper: savedSessionCount ? "Learners can return to these later" : "Nothing saved yet",
                      },
                      {
                        label: "Feedback Inbox",
                        value: requestHistory.length,
                        helper: requestConfigured ? "Central inbox connected" : "Currently falling back to local saves",
                      },
                      {
                        label: "Cloud / Network",
                        value: isOnline ? "Online" : "Offline",
                        helper: cloudSyncStatus || (cloudSyncReady ? "Cloud sync available" : "Cloud sync not configured"),
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        style={{
                          borderRadius: 18,
                          padding: 18,
                          border: `1px solid ${C.border}`,
                          background: "#FCFBF8",
                        }}
                      >
                        <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          {item.label}
                        </div>
                        <div style={{ marginTop: 10, fontSize: typeof item.value === "number" ? 34 : 24, fontWeight: 900, letterSpacing: "-0.05em" }}>
                          {item.value}
                        </div>
                        <div style={{ marginTop: 8, fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                          {item.helper}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      display: adminView === "overview" ? "grid" : "none",
                      gridTemplateColumns: width < 980 ? "1fr" : "minmax(0, 1.15fr) minmax(300px, 0.85fr)",
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        border: `1px solid ${C.border}`,
                        background: "#FCFBF8",
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Subject Performance Trend
                      </div>
                      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                        {subjectPerformanceSummary.length ? (
                          subjectPerformanceSummary.slice(0, 8).map((item) => (
                            <div
                              key={item.subject}
                              style={{
                                padding: "12px 14px",
                                borderRadius: 14,
                                background: C.surface,
                                border: `1px solid ${C.border}`,
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                                <div style={{ fontSize: 14, fontWeight: 800 }}>{item.subject}</div>
                                <Badge label={`${item.average}% avg`} color={item.average >= 75 ? "green" : item.average >= 60 ? "amber" : "red"} />
                              </div>
                              <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: "#E8E4DC", overflow: "hidden" }}>
                                <div
                                  style={{
                                    width: `${item.average}%`,
                                    height: "100%",
                                    background: item.average >= 75 ? "#2D6A4F" : item.average >= 60 ? "#E7A93B" : "#C1121F",
                                  }}
                                />
                              </div>
                              <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>
                                {item.attempts} session{item.attempts === 1 ? "" : "s"} | {item.answered} answered overall
                              </div>
                            </div>
                          ))
                        ) : (
                          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                            Once learners submit flashcards, quizzes, or simulations, subject performance trends will appear here.
                          </div>
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        border: `1px solid ${C.border}`,
                        background: "#FCFBF8",
                        display: "grid",
                        gap: 14,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Feedback Types
                        </div>
                        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                          {requestTypeSummary.length ? (
                            requestTypeSummary.slice(0, 6).map(([type, count]) => (
                              <div
                                key={type}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 12,
                                  padding: "12px 14px",
                                  borderRadius: 14,
                                  background: C.surface,
                                  border: `1px solid ${C.border}`,
                                  fontSize: 13,
                                  color: C.text,
                                  fontWeight: 700,
                                }}
                              >
                                <span>{type}</span>
                                <span>{count}</span>
                              </div>
                            ))
                          ) : (
                            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                              No feedback items are stored yet. Request and report activity will show here once learners start sending notes.
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Product Signals
                        </div>
                        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                          <div style={{ padding: "12px 14px", borderRadius: 14, background: C.surface, border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.7 }}>
                            Weak-card backlog: <strong>{weakCardIds.length}</strong>{weakestSubject ? `, strongest pull in ${weakestSubject}` : ""}
                          </div>
                          <div style={{ padding: "12px 14px", borderRadius: 14, background: C.surface, border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.7 }}>
                            Recent misses ready for remediation: <strong>{incorrectReviewItems.length}</strong>
                          </div>
                          <div style={{ padding: "12px 14px", borderRadius: 14, background: C.surface, border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.7 }}>
                            Simulation flagged questions in current run: <strong>{simulationFlaggedCount}</strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: adminView === "feedback" ? "block" : "none",
                      borderRadius: 18,
                      padding: 18,
                      border: `1px solid ${C.border}`,
                      background: "#FCFBF8",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Recent Requests
                        </div>
                        <div style={{ marginTop: 6, fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                          The latest request or report items collected through CareDrop.
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: requestConfigured ? C.accent : C.amber, fontWeight: 800 }}>
                        {requestConfigured ? "Central inbox connected" : "Local fallback mode"}
                      </div>
                    </div>
                    <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                      {adminFeedbackItems.length ? (
                        adminFeedbackItems.slice(0, 8).map((entry) => (
                          <div
                            key={entry.id || entry.number || entry.createdAt}
                            style={{
                              padding: "14px 16px",
                              borderRadius: 14,
                              background: C.surface,
                              border: `1px solid ${C.border}`,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                <Badge label={entry.type || "General Feedback"} color="gray" />
                                {entry.state === "local" ? <Badge label="local only" color="amber" /> : null}
                                {entry.number ? <Badge label={`#${entry.number}`} color="blue" /> : null}
                              </div>
                              <div style={{ fontSize: 12, color: C.muted }}>{getLocalDateLabel(entry.createdAt)}</div>
                            </div>
                            <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.7, color: C.text }}>
                              {entry.message}
                            </div>
                            <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>
                              Submitted by: <strong style={{ color: C.text }}>{entry.submittedBy || entry.name || "Anonymous"}</strong>
                            </div>
                            {entry.url ? (
                              <a
                                href={entry.url}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  marginTop: 10,
                                  display: "inline-block",
                                  fontSize: 12,
                                  fontWeight: 800,
                                  color: C.accent,
                                  textDecoration: "none",
                                }}
                              >
                                Open linked issue
                              </a>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                          No requests have been submitted yet. Once learners start sending fixes, topic requests, or bug reports, they will appear here.
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      display: adminView === "planning" ? "grid" : "none",
                      gridTemplateColumns: width < 980 ? "1fr" : "repeat(3, minmax(0, 1fr))",
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        border: `1px solid ${C.border}`,
                        background: "#FCFBF8",
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Feature Adoption
                      </div>
                      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                        {featureUsageSummary.map((item) => (
                          <div
                            key={item.label}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 12,
                              padding: "12px 14px",
                              borderRadius: 14,
                              background: "#FFFFFF",
                              border: `1px solid ${C.border}`,
                              fontSize: 13,
                              color: C.text,
                              fontWeight: 700,
                            }}
                          >
                            <span>{item.label}</span>
                            <span>{item.value}</span>
                          </div>
                        ))}
                        {plannerModeSummary.length ? (
                          <div style={{ marginTop: 4, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
                            Planner mix: {plannerModeSummary.slice(0, 3).map(([modeName, count]) => `${modeName} (${count})`).join(", ")}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        border: `1px solid ${C.border}`,
                        background: "#FCFBF8",
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Planning Pressure Points
                      </div>
                      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                        <div style={{ padding: "12px 14px", borderRadius: 14, background: "#FFFFFF", border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.7 }}>
                          Upcoming calendar events: <strong>{upcomingEvents.length}</strong>
                        </div>
                        <div style={{ padding: "12px 14px", borderRadius: 14, background: "#FFFFFF", border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.7 }}>
                          Planner completion rate: <strong>{plannerCompletionRate}%</strong>
                        </div>
                        <div style={{ padding: "12px 14px", borderRadius: 14, background: "#FFFFFF", border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.7 }}>
                          Overdue planner items: <strong>{overduePlannerItems.length}</strong>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        border: `1px solid ${C.border}`,
                        background: "#FCFBF8",
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Scheduled Subjects
                      </div>
                      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                        {scheduledSubjectSummary.length ? (
                          scheduledSubjectSummary.slice(0, 6).map(([subjectName, count]) => (
                            <div
                              key={subjectName}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 12,
                                padding: "12px 14px",
                                borderRadius: 14,
                                background: "#FFFFFF",
                                border: `1px solid ${C.border}`,
                                fontSize: 13,
                                color: C.text,
                                fontWeight: 700,
                              }}
                            >
                              <span>{subjectName}</span>
                              <span>{count}</span>
                            </div>
                          ))
                        ) : (
                          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                            No subject-tagged calendar entries yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: adminView === "activity" ? "grid" : "none",
                      gridTemplateColumns: width < 980 ? "1fr" : "minmax(0, 1.1fr) minmax(300px, 0.9fr)",
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        border: `1px solid ${C.border}`,
                        background: "#FCFBF8",
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Recent Session Activity
                      </div>
                      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                        {adminRecentSessions.length ? (
                          adminRecentSessions.map((session) => (
                            <div
                              key={session.id}
                              style={{
                                padding: "14px 16px",
                                borderRadius: 14,
                                background: "#FFFFFF",
                                border: `1px solid ${C.border}`,
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                  <Badge label={buildSessionLabel(session)} color="blue" />
                                  {session.subject ? <Badge label={session.subject} color="gray" /> : null}
                                  {typeof session.score === "number" ? (
                                    <Badge label={`${session.score}%`} color={session.score >= 75 ? "green" : session.score >= 60 ? "amber" : "red"} />
                                  ) : null}
                                </div>
                                <div style={{ fontSize: 12, color: C.muted }}>{getLocalDateLabel(session.createdAt)}</div>
                              </div>
                              <div style={{ marginTop: 8, fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                                {session.answeredCount || 0} answered | {session.saved ? "saved for return" : "completed in one pass"}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                            No study sessions yet. Once learners begin reviewing, their recent activity trail will appear here.
                          </div>
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        border: `1px solid ${C.border}`,
                        background: "#FCFBF8",
                        display: "grid",
                        gap: 10,
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Retention Signals
                      </div>
                      <div style={{ padding: "12px 14px", borderRadius: 14, background: "#FFFFFF", border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.7 }}>
                        Current study streak: <strong>{studyStreak}</strong> day{studyStreak === 1 ? "" : "s"}
                      </div>
                      <div style={{ padding: "12px 14px", borderRadius: 14, background: "#FFFFFF", border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.7 }}>
                        Answered today: <strong>{todayAnsweredCount}</strong> / {dailyGoalTarget}
                      </div>
                      <div style={{ padding: "12px 14px", borderRadius: 14, background: "#FFFFFF", border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.7 }}>
                        Saved sessions waiting: <strong>{savedSessionCount}</strong>
                      </div>
                      <div style={{ padding: "12px 14px", borderRadius: 14, background: "#FFFFFF", border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.7 }}>
                        Readiness score snapshot: <strong>{readinessScore}%</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </AnalyticsCard>
            ) : null}

            {mode === "flashcard" ? (
              <div style={panelStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    marginBottom: 20,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17 }}>Flashcards</div>
                    <div style={{ fontSize: 12, color: C.muted }}>
                      {subjectDisplay} | {difficulty === "All" ? "all difficulties" : difficulty} | {topicFilter || "all topics"} | target {FLASHCARD_SET_SIZE} cards per set
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => setCardIdx((value) => Math.max(0, value - 1))}
                      disabled={!flashcards.length || cardIdx === 0}
                      style={{
                        padding: "9px 14px",
                        borderRadius: 10,
                        border: `1px solid ${C.border}`,
                        background: C.surface,
                        cursor: !flashcards.length || cardIdx === 0 ? "not-allowed" : "pointer",
                      }}
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => setCardIdx((value) => Math.min(flashcards.length - 1, value + 1))}
                      disabled={!flashcards.length || cardIdx >= flashcards.length - 1}
                      style={{
                        padding: "9px 14px",
                        borderRadius: 10,
                        border: `1px solid ${C.border}`,
                        background: C.surface,
                        cursor:
                          !flashcards.length || cardIdx >= flashcards.length - 1
                            ? "not-allowed"
                            : "pointer",
                      }}
                    >
                      Next
                    </button>
                    <button
                      onClick={() => loadLocalFlashcardSet("A fresh local flashcard set was loaded.")}
                      style={{
                        padding: "9px 14px",
                        borderRadius: 10,
                        border: `1px solid ${C.accentMid}`,
                        background: C.accentLight,
                        color: C.accent,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      New 10-Card Set
                    </button>
                    <button
                      onClick={generateClaudeFlashcards}
                      disabled={apiLoading}
                      style={{
                        padding: "9px 14px",
                        borderRadius: 10,
                        border: "none",
                        background: apiLoading ? C.border : C.accent,
                        color: apiLoading ? C.muted : "#fff",
                        fontWeight: 700,
                        cursor: apiLoading ? "not-allowed" : "pointer",
                      }}
                    >
                      {apiLoading ? "Loading..." : topicFilter || hasCustomSource ? "Generate More with Gemini" : "Gemini Focus Set"}
                    </button>
                  </div>
                </div>

                {currentCard ? (
                  <>
                    <Flashcard
                      card={currentCard}
                      idx={cardIdx}
                      total={flashcards.length}
                      onRate={handleRate}
                    />
                    <div
                      style={{
                        marginTop: 16,
                        borderRadius: 18,
                        padding: 18,
                        background: "#FBFAF7",
                        border: `1.5px solid ${C.border}`,
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, marginBottom: 10 }}>
                        Flashcard Session Progress
                      </div>
                      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 14, lineHeight: 1.7 }}>
                        <div>Reviewed: <strong>{flashcardCompletedCount} / {flashcards.length}</strong></div>
                        <div>Strong: <strong>{flashcardStrongCount}</strong></div>
                        <div>Needs work: <strong>{flashcardNeedsReviewCount}</strong></div>
                        <div>Progress: <strong>{flashcardProgressPercent}%</strong></div>
                      </div>
                      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button
                          onClick={submitFlashcardSession}
                          disabled={flashcardCompletedCount < flashcards.length || flashcardSessionSubmitted}
                          style={{
                            padding: "10px 16px",
                            borderRadius: 10,
                            border: "none",
                            background:
                              flashcardCompletedCount < flashcards.length || flashcardSessionSubmitted
                                ? C.border
                                : C.accent,
                            color:
                              flashcardCompletedCount < flashcards.length || flashcardSessionSubmitted
                                ? C.muted
                                : "#fff",
                            fontWeight: 700,
                            cursor:
                              flashcardCompletedCount < flashcards.length || flashcardSessionSubmitted
                                ? "not-allowed"
                                : "pointer",
                          }}
                        >
                          {flashcardSessionSubmitted ? "Flashcard Session Submitted" : "Submit Flashcard Session"}
                        </button>
                        {flashcardSessionSubmitted ? (
                          <button
                            onClick={() => loadLocalFlashcardSet("A new 10-card flashcard set is ready.")}
                            style={{
                              padding: "10px 16px",
                              borderRadius: 10,
                              border: `1px solid ${C.border}`,
                              background: C.surface,
                              color: C.text,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Start Another Set
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      border: `1px dashed ${C.border}`,
                      borderRadius: 20,
                      padding: "44px 24px",
                      textAlign: "center",
                      color: C.muted,
                      lineHeight: 1.7,
                    }}
                  >
                    {subject || topicFilter
                      ? "No card data exists for this exact filter yet. Try another focus or upload a document to build more cards."
                      : "Select a subject in Review Filters, then generate a flashcard set for that focus."}
                  </div>
                )}
              </div>
            ) : null}

            {mode === "quiz" ? (
              <div style={panelStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "center",
                    marginBottom: 18,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17 }}>Quiz</div>
                    <div style={{ fontSize: 12, color: C.muted }}>
                      {remediationContext
                        ? `Remediation set | ${remediationContext.weakestSubject || remediationContext.topic || "recent weak areas"} | ${QUIZ_SET_SIZE} questions`
                        : `Target ${QUIZ_SET_SIZE} questions | strict difficulty filter | saved sessions supported`}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={generateQuiz}
                      disabled={apiLoading}
                      style={{
                        padding: "10px 16px",
                        borderRadius: 10,
                        border: "none",
                        background: apiLoading ? C.border : C.accent,
                        color: apiLoading ? C.muted : "#fff",
                        fontWeight: 700,
                        cursor: apiLoading ? "not-allowed" : "pointer",
                      }}
                    >
                      {apiLoading ? "Generating..." : topicFilter || hasCustomSource ? "Generate Another 10" : "Generate 10 Questions"}
                    </button>
                    <button
                      onClick={saveCurrentQuiz}
                      disabled={!quiz.length}
                      style={{
                        padding: "10px 16px",
                        borderRadius: 10,
                        border: `1px solid ${C.border}`,
                        background: quiz.length ? C.surface : C.border,
                        color: quiz.length ? C.text : C.muted,
                        fontWeight: 700,
                        cursor: quiz.length ? "pointer" : "not-allowed",
                      }}
                    >
                      Save Quiz
                    </button>
                  </div>
                </div>

                {!quizItem ? (
                  <div
                    style={{
                      border: `1px dashed ${C.border}`,
                      borderRadius: 20,
                      padding: "44px 24px",
                      textAlign: "center",
                      color: C.muted,
                      lineHeight: 1.7,
                    }}
                  >
                    {subject || topicFilter
                      ? "Generate a quiz to load a 10-question session for this subject and topic focus."
                      : "Select a subject in Review Filters, then generate a focused quiz session."}
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                      <Badge label={`Q ${quizIdx + 1} / ${quiz.length}`} color="blue" />
                      <Badge label={quizItem.subject} color="gray" />
                      <Badge label={quizItem.topic} color="gray" />
                      <Badge
                        label={quizItem.difficulty}
                        color={
                          quizItem.difficulty === "hard"
                            ? "red"
                            : quizItem.difficulty === "medium"
                              ? "amber"
                              : "green"
                        }
                      />
                    </div>

                    <div
                      style={{
                        height: 6,
                        background: C.border,
                        borderRadius: 999,
                        overflow: "hidden",
                        marginBottom: 16,
                      }}
                    >
                      <div
                        style={{
                          width: `${progressPercent}%`,
                          height: "100%",
                          background: C.accentMid,
                        }}
                      />
                    </div>

                    <div
                      key={quizItem.id}
                      style={{
                        background: C.panelNeutralAlt,
                        borderRadius: 18,
                        padding: 22,
                        border: `1.5px solid ${C.panelNeutralDark}`,
                        animation: "caredropFadeSlide 0.24s ease",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: C.faint,
                          fontWeight: 700,
                          letterSpacing: "0.07em",
                          textTransform: "uppercase",
                          marginBottom: 10,
                        }}
                      >
                        Question
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.5 }}>
                        {quizItem.prompt}
                      </div>
                    </div>

                    <div key={`${quizItem.id}-options`} style={{ marginTop: 16, display: "grid", gap: 10, animation: "caredropFadeSlide 0.24s ease" }}>
                      {quizItem.options.map((option) => {
                        const selected = quizItem.userAnswer !== null ? quizItem.userAnswer === option : selectedQuizOption === option;
                        const correct = normalize(option) === normalize(quizItem.correctAnswer);
                        const background = showFeedback && correct
                          ? "#ECFDF5"
                          : showFeedback && selected && !correct
                            ? "#FFF1F2"
                            : C.panelNeutralAlt;
                        const borderColor = showFeedback && correct
                          ? "#10B981"
                          : showFeedback && selected && !correct
                            ? "#F43F5E"
                            : C.panelNeutralDark;

                        return (
                          <label
                            key={option}
                            style={{
                              textAlign: "left",
                              padding: "14px 16px",
                              borderRadius: 14,
                              border: `1px solid ${borderColor}`,
                              background,
                              cursor: quizItem.userAnswer !== null ? "default" : "pointer",
                              fontSize: 14,
                              lineHeight: 1.6,
                              transition: "transform 0.18s ease, border-color 0.18s ease, background 0.18s ease",
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 12,
                            }}
                          >
                            <input
                              type="radio"
                              name={`quiz-${quizItem.id}`}
                              checked={selected}
                              disabled={quizItem.userAnswer !== null}
                              onChange={() => handleQuizAnswer(option)}
                              style={{ marginTop: 4 }}
                            />
                            <span>{option}</span>
                          </label>
                        );
                      })}
                    </div>

                    {!showFeedback && quizItem.userAnswer === null ? (
                      <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={submitQuizAnswer}
                          disabled={!selectedQuizOption}
                          style={{
                            padding: "10px 16px",
                            borderRadius: 10,
                            border: "none",
                            background: selectedQuizOption ? C.accent : C.border,
                            color: selectedQuizOption ? "#fff" : C.muted,
                            fontWeight: 700,
                            cursor: selectedQuizOption ? "pointer" : "not-allowed",
                          }}
                        >
                          Submit Answer
                        </button>
                      </div>
                    ) : null}

                    {showFeedback && quizItem.userAnswer !== null ? (
                      <div
                        style={{
                          marginTop: 16,
                          borderRadius: 18,
                          padding: 18,
                          background: currentCorrect ? "#F3FBF6" : "#FFF6F6",
                          border: `1px solid ${currentCorrect ? "#10B981" : "#F43F5E"}`,
                        }}
                      >
                        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
                          {currentCorrect ? "Correct" : "Incorrect"}
                        </div>
                        <div style={{ fontSize: 14, lineHeight: 1.75 }}>
                          <div>
                            <strong>Your answer:</strong> {quizItem.userAnswer}
                          </div>
                          <div>
                            <strong>Correct answer:</strong> {quizItem.correctAnswer}
                          </div>
                          <div>
                            <strong>Rationale:</strong> {quizItem.rationale}
                          </div>
                          <div>
                            <strong>Memory tip:</strong> {quizItem.notes}
                          </div>
                          {!currentCorrect ? (
                            <div>
                              <strong>Why your answer is weaker:</strong> It does not match the best nursing priority or review principle as closely as the correct answer.
                            </div>
                          ) : null}
                        </div>
                        {!currentCorrect ? (
                          <div
                            style={{
                              marginTop: 14,
                              padding: 14,
                              borderRadius: 14,
                              background: "#FFFFFF",
                              border: `1px solid ${C.panelNeutralDark}`,
                            }}
                          >
                            <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, marginBottom: 8 }}>
                              AI Review Help
                            </div>
                            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 10 }}>
                              Ask anything about this missed item. You can ask for a mnemonic, a simpler explanation, or another example.
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <input
                                value={question}
                                onChange={(event) => setQuestion(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    askClaude();
                                  }
                                }}
                                placeholder="Why is this correct? Explain it simply. Give me a mnemonic..."
                                style={{
                                  flex: 1,
                                  minWidth: 220,
                                  padding: "10px 12px",
                                  borderRadius: 10,
                                  border: `1px solid ${C.border}`,
                                  background: "#FBFAF7",
                                  fontSize: 13,
                                  outline: "none",
                                }}
                              />
                              <button
                                onClick={askClaude}
                                disabled={apiLoading || !question.trim()}
                                style={{
                                  padding: "10px 14px",
                                  borderRadius: 10,
                                  border: "none",
                                  background: apiLoading || !question.trim() ? C.border : C.accent,
                                  color: apiLoading || !question.trim() ? C.muted : "#fff",
                                  fontWeight: 700,
                                  cursor: apiLoading || !question.trim() ? "not-allowed" : "pointer",
                                }}
                              >
                                {apiLoading ? "Thinking..." : "Ask AI"}
                              </button>
                            </div>
                            {aiResponse ? (
                              <div
                                style={{
                                  marginTop: 10,
                                  padding: 12,
                                  borderRadius: 12,
                                  background: C.accentLight,
                                  border: `1px solid ${C.accentMid}`,
                                  fontSize: 13,
                                  lineHeight: 1.7,
                                  whiteSpace: "pre-wrap",
                                }}
                              >
                                {aiResponse}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            onClick={() => {
                              setShowFeedback(false);
                              setAiResponse("");
                              setQuestion("");
                              setQuizIdx((value) => Math.min(value + 1, quiz.length - 1));
                            }}
                            disabled={quizIdx >= quiz.length - 1}
                            style={{
                              padding: "10px 16px",
                              borderRadius: 10,
                              border: "none",
                              background: quizIdx >= quiz.length - 1 ? C.border : C.accent,
                              color: quizIdx >= quiz.length - 1 ? C.muted : "#fff",
                              fontWeight: 700,
                              cursor: quizIdx >= quiz.length - 1 ? "not-allowed" : "pointer",
                            }}
                          >
                            Next Question
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {quizIdx === quiz.length - 1 && quizItem.userAnswer !== null ? (
                      <div
                        style={{
                          marginTop: 16,
                          borderRadius: 18,
                          padding: 18,
                          background: C.panelNeutral,
                          border: `1px solid ${C.panelNeutralDark}`,
                        }}
                      >
                        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
                          Quiz Summary
                        </div>
                        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 14 }}>
                          <div>Answered: <strong>{answeredCount}</strong></div>
                          <div>Correct: <strong>{correctCount}</strong></div>
                          <div>
                            Score: <strong>{quiz.length ? Math.round((correctCount / quiz.length) * 100) : 0}%</strong>
                          </div>
                        </div>
                        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button
                            onClick={submitQuizSession}
                            disabled={answeredCount < quiz.length || quizSubmitted}
                            style={{
                              padding: "10px 16px",
                              borderRadius: 10,
                              border: "none",
                              background: answeredCount < quiz.length || quizSubmitted ? C.border : C.accent,
                              color: answeredCount < quiz.length || quizSubmitted ? C.muted : "#fff",
                              fontWeight: 700,
                              cursor: answeredCount < quiz.length || quizSubmitted ? "not-allowed" : "pointer",
                            }}
                          >
                            {quizSubmitted ? "Quiz Session Submitted" : "Submit Quiz Session"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              startRemediationMode({
                                id: uid(),
                                mode: "quiz",
                                subject: subject || quizItem?.subject || "",
                                topic: topicFilter || quizItem?.topic || "",
                                questions: quiz,
                                correctCount,
                                answeredCount,
                              })
                            }
                            disabled={answeredCount < quiz.length}
                            style={{
                              padding: "10px 16px",
                              borderRadius: 10,
                              border: `1px solid ${C.border}`,
                              background: answeredCount < quiz.length ? C.border : C.surface,
                              color: answeredCount < quiz.length ? C.muted : C.text,
                              fontWeight: 700,
                              cursor: answeredCount < quiz.length ? "not-allowed" : "pointer",
                            }}
                          >
                            Build Remediation Set
                          </button>
                          {quizSubmitted ? (
                            <button
                              onClick={generateQuiz}
                              disabled={apiLoading}
                              style={{
                                padding: "10px 16px",
                                borderRadius: 10,
                                border: `1px solid ${C.border}`,
                                background: C.surface,
                                color: C.text,
                                fontWeight: 700,
                                cursor: apiLoading ? "not-allowed" : "pointer",
                              }}
                            >
                              Generate Another Set
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {mode === "simulation" ? (
              <div style={panelStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>Simulation Exam</div>
                    <div style={{ fontSize: 12, color: C.muted, maxWidth: 720 }}>
                      Build a mixed board-style exam across the full CareDrop bank. Gemini helps expand parts of the set so the simulation feels broader and closer to a real long-form review exam.
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {SIMULATION_SIZE_OPTIONS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => generateSimulationExam(value)}
                        disabled={apiLoading}
                        style={{
                          padding: "10px 16px",
                          borderRadius: 10,
                          border: simulationSize === value ? "none" : `1px solid ${C.border}`,
                          background: simulationSize === value ? C.accent : C.surface,
                          color: simulationSize === value ? "#fff" : C.text,
                          fontWeight: 700,
                          cursor: apiLoading ? "not-allowed" : "pointer",
                        }}
                      >
                        {apiLoading && simulationSize === value ? "Preparing..." : `Generate ${value}`}
                      </button>
                    ))}
                  </div>
                </div>

                {!simulationItem ? (
                  <div
                    style={{
                      marginTop: 18,
                      border: `1px dashed ${C.border}`,
                      borderRadius: 18,
                      padding: 24,
                      background: "#FBFAF7",
                      color: C.muted,
                      lineHeight: 1.7,
                    }}
                  >
                    Generate a mixed 50-, 100-, or 500-question simulation exam. This mode ignores the current subject filter so the learner gets a broader board-style exam experience.
                  </div>
                ) : (
                  <>
                    <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 999, background: "#E8E4DC", overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${simulationProgressPercent}%`,
                            height: "100%",
                            background: "linear-gradient(90deg, #2D6A4F 0%, #7BCB9A 100%)",
                          }}
                        />
                      </div>
                      <div style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>
                        {simulationAnsweredCount}/{simulationQuestions.length} answered
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 14,
                        display: "grid",
                        gap: 8,
                        gridTemplateColumns: width < 900 ? "repeat(6, minmax(0, 1fr))" : "repeat(10, minmax(0, 1fr))",
                      }}
                    >
                      {simulationQuestions
                        .slice(
                          simulationQuestions.length <= 100
                            ? 0
                            : clamp(simulationIdx - 49, 0, Math.max(simulationQuestions.length - 100, 0)),
                          simulationQuestions.length <= 100
                            ? simulationQuestions.length
                            : clamp(simulationIdx - 49, 0, Math.max(simulationQuestions.length - 100, 0)) + 100
                        )
                        .map((item, localIndex) => {
                        const startIndex =
                          simulationQuestions.length <= 100
                            ? 0
                            : clamp(simulationIdx - 49, 0, Math.max(simulationQuestions.length - 100, 0));
                        const index = startIndex + localIndex;
                        const answered = item.userAnswer !== null;
                        const active = index === simulationIdx;
                        return (
                          <button
                            key={`${item.id}-jump`}
                            type="button"
                            onClick={() => setSimulationIdx(index)}
                            style={{
                              padding: "8px 0",
                              borderRadius: 10,
                              border: active ? `1px solid ${C.accent}` : `1px solid ${item.flagged ? C.amber : C.border}`,
                              background: active ? C.accentLight : item.flagged ? C.amberLight : C.surface,
                              color: active ? C.accent : item.flagged ? C.amber : answered ? C.text : C.muted,
                              fontWeight: 800,
                              cursor: "pointer",
                              fontSize: 12,
                            }}
                            title={item.flagged ? "Flagged for review" : answered ? "Answered" : "Unanswered"}
                          >
                            {index + 1}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: C.muted }}>
                      <div>{simulationFlaggedCount} flagged</div>
                      <div>{simulationQuestions.length - simulationAnsweredCount} unanswered</div>
                      <div>{simulationSize}-item target</div>
                      {simulationQuestions.length > 100 ? <div>Palette shows the questions around your current position</div> : null}
                    </div>

                    <div
                      key={simulationItem.id}
                      style={{
                        marginTop: 18,
                        background: C.panelNeutralAlt,
                        borderRadius: 18,
                        border: `1px solid ${C.panelNeutralDark}`,
                        padding: width < 720 ? 18 : 24,
                      }}
                    >
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                        <Badge label={`Q ${simulationIdx + 1} / ${simulationQuestions.length}`} color="blue" />
                        <Badge label={simulationItem.subject} color="gray" />
                        <Badge label={simulationItem.topic} color="gray" />
                        <Badge
                          label={simulationItem.difficulty}
                          color={
                            simulationItem.difficulty === "hard"
                              ? "red"
                              : simulationItem.difficulty === "medium"
                                ? "amber"
                                : "green"
                          }
                        />
                        {simulationItem.flagged ? <Badge label="flagged" color="amber" /> : null}
                      </div>

                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
                        Simulation Question
                      </div>
                      <div style={{ fontSize: width < 640 ? 21 : 28, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.15 }}>
                        {simulationItem.prompt}
                      </div>

                      <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
                        {simulationItem.options.map((option) => {
                          const selected = simulationItem.userAnswer === option;
                          const correct = normalize(option) === normalize(simulationItem.correctAnswer);
                          const background = simulationSubmitted && correct
                            ? "#ECFDF5"
                            : simulationSubmitted && selected && !correct
                              ? "#FFF1F2"
                              : C.panelNeutralAlt;
                          const borderColor = simulationSubmitted && correct
                            ? "#10B981"
                            : simulationSubmitted && selected && !correct
                              ? "#F43F5E"
                              : C.panelNeutralDark;

                          return (
                            <label
                              key={`${simulationItem.id}-${option}`}
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 12,
                                padding: "14px 16px",
                                borderRadius: 14,
                                background,
                                border: `1px solid ${borderColor}`,
                                cursor: simulationSubmitted ? "default" : "pointer",
                                fontSize: 14,
                                lineHeight: 1.6,
                              }}
                            >
                              <input
                                type="radio"
                                name={`simulation-${simulationItem.id}`}
                                checked={selected}
                                disabled={simulationSubmitted}
                                onChange={() => handleSimulationAnswer(option)}
                                style={{ marginTop: 4 }}
                              />
                              <span>{option}</span>
                            </label>
                          );
                        })}
                      </div>

                      {!simulationSubmitted ? (
                        <div
                          style={{
                            marginTop: 14,
                            padding: 14,
                            borderRadius: 14,
                            background: C.panelNeutral,
                            border: `1px solid ${C.panelNeutralDark}`,
                            fontSize: 13,
                            color: C.muted,
                            lineHeight: 1.7,
                          }}
                        >
                          {simulationItem.userAnswer
                            ? "Answer saved. You can still move back and change it before the final submission."
                            : "Choose an answer, move to the next question, and review any item before the final submission."}
                        </div>
                      ) : null}

                      {!simulationSubmitted ? (
                        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            onClick={toggleSimulationFlag}
                            style={{
                              padding: "9px 14px",
                              borderRadius: 10,
                              border: `1px solid ${simulationItem.flagged ? C.amber : C.border}`,
                              background: simulationItem.flagged ? C.amberLight : C.surface,
                              color: simulationItem.flagged ? C.amber : C.text,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            {simulationItem.flagged ? "Unflag Question" : "Flag for Review"}
                          </button>
                        </div>
                      ) : null}

                      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => setSimulationIdx((value) => Math.max(0, value - 1))}
                            disabled={simulationIdx === 0}
                            style={{
                              padding: "10px 16px",
                              borderRadius: 10,
                              border: `1px solid ${C.border}`,
                              background: C.surface,
                              color: simulationIdx === 0 ? C.faint : C.text,
                              fontWeight: 700,
                              cursor: simulationIdx === 0 ? "not-allowed" : "pointer",
                            }}
                          >
                            Previous
                          </button>
                          <button
                            type="button"
                            onClick={() => setSimulationIdx((value) => Math.min(value + 1, simulationQuestions.length - 1))}
                            disabled={simulationIdx >= simulationQuestions.length - 1}
                            style={{
                              padding: "10px 16px",
                              borderRadius: 10,
                              border: "none",
                              background: simulationIdx >= simulationQuestions.length - 1 ? C.border : C.accent,
                              color: simulationIdx >= simulationQuestions.length - 1 ? C.muted : "#fff",
                              fontWeight: 700,
                              cursor: simulationIdx >= simulationQuestions.length - 1 ? "not-allowed" : "pointer",
                            }}
                          >
                            Next Question
                          </button>
                        </div>
                        {!simulationSubmitted && simulationIdx === simulationQuestions.length - 1 ? (
                          <button
                            type="button"
                            onClick={submitSimulationExam}
                            disabled={simulationAnsweredCount < simulationQuestions.length}
                            style={{
                              padding: "10px 16px",
                              borderRadius: 10,
                              border: "none",
                              background: simulationAnsweredCount < simulationQuestions.length ? C.border : "#1A2740",
                              color: simulationAnsweredCount < simulationQuestions.length ? C.muted : "#fff",
                              fontWeight: 700,
                              cursor: simulationAnsweredCount < simulationQuestions.length ? "not-allowed" : "pointer",
                            }}
                          >
                            Submit Simulation
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 16,
                        borderRadius: 18,
                        padding: 18,
                        background: C.panelNeutral,
                        border: `1px solid ${C.panelNeutralDark}`,
                      }}
                    >
                      {!simulationSubmitted ? (
                        <>
                          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Simulation Overview</div>
                          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 14 }}>
                            <div>Answered: <strong>{simulationAnsweredCount}</strong></div>
                            <div>Remaining: <strong>{Math.max(simulationQuestions.length - simulationAnsweredCount, 0)}</strong></div>
                            <div>Current target: <strong>{simulationSize} questions</strong></div>
                          </div>
                          <div style={{ marginTop: 10, fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                            Answers stay hidden while the simulation is active so the flow feels closer to an actual long-form exam. Move back through earlier questions anytime if you want to review or change an answer before the final submit on the last item.
                          </div>
                        </>
                      ) : (
                        <>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              gap: 16,
                              flexWrap: "wrap",
                            }}
                          >
                            <div>
                              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Simulation Results</div>
                              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, maxWidth: 760 }}>
                                {simulationUsedAi
                                  ? "This mixed simulation combined the CareDrop bank with Gemini-generated expansion to make the exam feel broader and closer to a real board-style review."
                                  : "This mixed simulation came from the CareDrop bank and is now saved in Review History for later review."}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSimulationAnswerSheetOpen((value) => !value)}
                              style={{
                                padding: "10px 14px",
                                borderRadius: 10,
                                border: `1px solid ${C.border}`,
                                background: C.surface,
                                color: C.text,
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              {simulationAnswerSheetOpen ? "Hide answer sheet" : "View answer sheet"}
                            </button>
                          </div>

                          <div
                            style={{
                              marginTop: 14,
                              display: "grid",
                              gap: 12,
                              gridTemplateColumns: width < 760 ? "1fr" : "repeat(4, minmax(0, 1fr))",
                            }}
                          >
                            {[
                              { label: "Overall score", value: `${simulationScore}%`, hint: `${simulationCorrectCount}/${simulationQuestions.length} correct` },
                              { label: "Answered", value: `${simulationAnsweredCount}`, hint: "Full exam submitted" },
                              { label: "Correct", value: `${simulationCorrectCount}`, hint: "Strong answers recorded" },
                              { label: "Incorrect", value: `${simulationIncorrectCount}`, hint: "Items to review again" },
                            ].map((item) => (
                              <div
                                key={item.label}
                                style={{
                                  padding: "14px 16px",
                                  borderRadius: 14,
                                  background: C.surface,
                                  border: `1px solid ${C.border}`,
                                }}
                              >
                                <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, marginBottom: 6 }}>{item.label}</div>
                                <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.04em" }}>{item.value}</div>
                                <div style={{ marginTop: 6, fontSize: 12, color: C.muted }}>{item.hint}</div>
                              </div>
                            ))}
                          </div>

                          <div
                            style={{
                              marginTop: 14,
                              display: "grid",
                              gap: 12,
                              gridTemplateColumns: width < 920 ? "1fr" : "1fr 1fr",
                            }}
                          >
                            <div
                              style={{
                                padding: "16px 18px",
                                borderRadius: 16,
                                background: C.surface,
                                border: `1px solid ${C.border}`,
                              }}
                            >
                              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>Subjects You Handled Well</div>
                              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                                {simulationStrongSubjects.length
                                  ? simulationStrongSubjects.map((item) => `${item.subject} (${item.percent}%)`).join(" • ")
                                  : "No single subject clearly pulled ahead in this exam yet. Your score is still spread across the full mixed review."}
                              </div>
                            </div>
                            <div
                              style={{
                                padding: "16px 18px",
                                borderRadius: 16,
                                background: C.surface,
                                border: `1px solid ${C.border}`,
                              }}
                            >
                              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>Subjects To Review Again</div>
                              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                                {simulationWeakSubjects.length
                                  ? simulationWeakSubjects.map((item) => `${item.subject} (${item.percent}%)`).join(" • ")
                                  : "No major weak subject cluster stood out in this run. Review the answer sheet to see the exact items you missed."}
                              </div>
                            </div>
                          </div>

                          <div
                            style={{
                              marginTop: 14,
                              display: "grid",
                              gap: 10,
                              gridTemplateColumns: width < 920 ? "1fr" : "repeat(2, minmax(0, 1fr))",
                            }}
                          >
                            {simulationSubjectBreakdown.map((item) => (
                              <div
                                key={item.subject}
                                style={{
                                  padding: "14px 16px",
                                  borderRadius: 14,
                                  background: C.surface,
                                  border: `1px solid ${C.border}`,
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                                  <div style={{ fontSize: 14, fontWeight: 800 }}>{item.subject}</div>
                                  <Badge label={`${item.percent}%`} color={item.percent >= 75 ? "green" : item.percent >= 60 ? "amber" : "red"} />
                                </div>
                                <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: "#E8E4DC", overflow: "hidden" }}>
                                  <div
                                    style={{
                                      width: `${item.percent}%`,
                                      height: "100%",
                                      background: item.percent >= 75 ? "#2D6A4F" : item.percent >= 60 ? "#E7A93B" : "#C1121F",
                                    }}
                                  />
                                </div>
                                <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>
                                  {item.correct}/{item.total} correct
                                </div>
                              </div>
                            ))}
                          </div>

                          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={() =>
                                startRemediationMode({
                                  id: uid(),
                                  mode: "simulation",
                                  subject: "Mixed Review",
                                  topic: "",
                                  questions: simulationQuestions,
                                  correctCount: simulationCorrectCount,
                                  answeredCount: simulationAnsweredCount,
                                })
                              }
                              style={{
                                padding: "10px 14px",
                                borderRadius: 12,
                                border: "none",
                                background: C.accent,
                                color: "#fff",
                                fontWeight: 800,
                                cursor: "pointer",
                              }}
                            >
                              Build Remediation Quiz
                            </button>
                            <button
                              type="button"
                              onClick={() => generateSimulationExam(simulationSize)}
                              style={{
                                padding: "10px 14px",
                                borderRadius: 12,
                                border: `1px solid ${C.border}`,
                                background: C.surface,
                                color: C.text,
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Start Another Simulation
                            </button>
                          </div>

                          {simulationAnswerSheetOpen ? (
                            <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
                              {simulationQuestions.map((item, index) => {
                                const isCorrect = !!item.userAnswer && normalize(item.userAnswer) === normalize(item.correctAnswer);
                                return (
                                  <div
                                    key={item.id}
                                    style={{
                                      padding: "16px 18px",
                                      borderRadius: 16,
                                      background: C.surface,
                                      border: `1px solid ${isCorrect ? "#10B981" : "#F43F5E"}`,
                                    }}
                                  >
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                                      <Badge label={`Q ${index + 1}`} color="blue" />
                                      <Badge label={item.subject} color="gray" />
                                      <Badge label={item.topic} color="gray" />
                                      {item.flagged ? <Badge label="flagged" color="amber" /> : null}
                                      <Badge
                                        label={isCorrect ? "Correct" : "Incorrect"}
                                        color={isCorrect ? "green" : "red"}
                                      />
                                    </div>
                                    <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.45 }}>{item.prompt}</div>
                                    <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                                      <div style={{ fontSize: 13, color: C.muted }}>
                                        Your answer: <strong style={{ color: C.text }}>{item.userAnswer || "No answer saved"}</strong>
                                      </div>
                                      <div style={{ fontSize: 13, color: C.muted }}>
                                        Correct answer: <strong style={{ color: C.text }}>{item.correctAnswer}</strong>
                                      </div>
                                      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7 }}>
                                        <strong>Rationale:</strong> {item.rationale}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {mode === "notes" ? (
              <div style={panelStyle}>
                <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>Notes & Upload</div>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 18 }}>
                  Upload a reviewer, PDF, or image, then use the extracted text for flashcards, quizzes, and reviewer notes.
                </div>

                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  style={{
                    border: `2px dashed ${dragActive ? C.accentMid : C.border}`,
                    borderRadius: 16,
                    padding: 22,
                    textAlign: "center",
                    background: dragActive ? C.accentLight : "#FBFAF7",
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, color: C.accent }}>DROPZONE</div>
                  <label
                    style={{
                      padding: "10px 18px",
                      borderRadius: 10,
                      background: C.accent,
                      color: "#fff",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-block",
                    }}
                  >
                    Choose File
                    <input
                      type="file"
                      accept=".doc,.docx,.pdf,.jpg,.jpeg,.png,.webp,.txt"
                      onChange={handleFileUpload}
                      style={{ display: "none" }}
                    />
                  </label>
                  <div style={{ marginTop: 10, fontSize: 12, color: C.muted }}>
                    {uploadedFileName || "No file uploaded yet."}
                  </div>
                  {uploadedFileName ? (
                    <div style={{ marginTop: 10, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                      <label
                        style={{
                          padding: "8px 14px",
                          borderRadius: 10,
                          background: C.surface,
                          border: `1px solid ${C.border}`,
                          color: C.text,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Replace File
                        <input
                          type="file"
                          accept=".doc,.docx,.pdf,.jpg,.jpeg,.png,.webp,.txt"
                          onChange={handleFileUpload}
                          style={{ display: "none" }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={removeUploadedSource}
                        style={{
                          padding: "8px 14px",
                          borderRadius: 10,
                          border: `1px solid ${C.red}`,
                          background: C.redLight,
                          color: C.red,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Remove File
                      </button>
                    </div>
                  ) : null}
                  <div style={{ marginTop: 6, fontSize: 12, color: C.faint }}>
                    Supported: DOC, DOCX, PDF, JPG, JPEG, PNG, WEBP, TXT
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 12,
                      color: uploadState === "failed" ? C.red : uploadState === "success" ? C.accent : C.muted,
                    }}
                  >
                    {uploadState === "idle"
                      ? "Idle"
                      : uploadState === "uploading"
                        ? "Uploading and extracting..."
                        : uploadState === "success"
                          ? "Upload successful"
                          : "Upload failed"}
                  </div>
                  {uploadError ? (
                    <div style={{ marginTop: 6, fontSize: 12, color: C.red }}>
                      {uploadError}
                    </div>
                  ) : null}
                </div>

                <textarea
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  placeholder="Paste lecture notes, reviewer text, or high-yield concepts here..."
                  style={{
                    width: "100%",
                    minHeight: 160,
                    marginTop: 16,
                    padding: "14px 16px",
                    borderRadius: 14,
                    border: `1px solid ${C.border}`,
                    background: C.bg,
                    fontSize: 14,
                    color: C.text,
                    resize: "vertical",
                    lineHeight: 1.7,
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                />

                <div style={{ display: "grid", gap: 10, gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, max-content))", marginTop: 14 }}>
                  <button
                    onClick={generateSummary}
                    disabled={apiLoading || !studyText.trim()}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 10,
                      border: "none",
                      background: apiLoading || !studyText.trim() ? C.border : C.accent,
                      color: apiLoading || !studyText.trim() ? C.muted : "#fff",
                      fontWeight: 700,
                      cursor: apiLoading || !studyText.trim() ? "not-allowed" : "pointer",
                    }}
                  >
                    Gemini Summary
                  </button>
                  <button
                    onClick={generateClaudeFlashcards}
                    disabled={apiLoading || !studyText.trim()}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 10,
                      border: `1px solid ${C.border}`,
                      background: apiLoading || !studyText.trim() ? C.border : C.surface,
                      color: apiLoading || !studyText.trim() ? C.muted : C.text,
                      fontWeight: 700,
                      cursor: apiLoading || !studyText.trim() ? "not-allowed" : "pointer",
                    }}
                  >
                    Gemini Flashcards
                  </button>
                  <button
                    onClick={generateQuiz}
                    disabled={apiLoading || !studyText.trim()}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 10,
                      border: `1px solid ${C.border}`,
                      background: apiLoading || !studyText.trim() ? C.border : C.surface,
                      color: apiLoading || !studyText.trim() ? C.muted : C.text,
                      fontWeight: 700,
                      cursor: apiLoading || !studyText.trim() ? "not-allowed" : "pointer",
                    }}
                  >
                    Gemini Quiz
                  </button>
                </div>

                <div
                  style={{
                    marginTop: 18,
                    background: "#FBFAF7",
                    borderRadius: 16,
                    border: `1px solid ${C.border}`,
                    padding: 18,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, marginBottom: 10 }}>
                    Reviewer Summary
                  </div>
                  <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.8 }}>
                    {summaryText}
                  </div>
                </div>
                {uploadedText ? (
                  <div
                    style={{
                      marginTop: 16,
                      background: "#FBFAF7",
                      borderRadius: 16,
                      border: `1px solid ${C.border}`,
                      padding: 18,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, marginBottom: 10 }}>
                      Extracted Content Preview
                    </div>
                    <div
                      style={{
                        whiteSpace: "pre-wrap",
                        fontSize: 13,
                        lineHeight: 1.8,
                        maxHeight: 220,
                        overflowY: "auto",
                      }}
                    >
                      {uploadedText.slice(0, 4000)}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {mode === "calendar" ? (
              <div style={panelStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    marginBottom: 18,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17 }}>Study Calendar</div>
                    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
                      Schedule review blocks, note important dates, and keep your next study commitments visible.
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => setCalendarMonth((value) => shiftMonth(value, -1))}
                      style={{
                        padding: "9px 12px",
                        borderRadius: 10,
                        border: `1px solid ${C.border}`,
                        background: C.surface,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Prev Month
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalendarMonth(new Date())}
                      style={{
                        padding: "9px 12px",
                        borderRadius: 10,
                        border: `1px solid ${C.border}`,
                        background: C.surface,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalendarMonth((value) => shiftMonth(value, 1))}
                      style={{
                        padding: "9px 12px",
                        borderRadius: 10,
                        border: `1px solid ${C.border}`,
                        background: C.surface,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Next Month
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: width < 1100 ? "1fr" : "minmax(0, 1.1fr) minmax(320px, 0.9fr)",
                    gap: 18,
                  }}
                >
                  <div
                    style={{
                      borderRadius: 18,
                      border: `1px solid ${C.border}`,
                      background: "#FCFBF8",
                      padding: 18,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>{getMonthLabel(calendarMonth)}</div>
                      <div style={{ fontSize: 12, color: C.muted }}>
                        {calendarEvents.length ? `${calendarEvents.length} total entries` : "No entries yet"}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                        gap: 8,
                        marginBottom: 10,
                      }}
                    >
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                        <div
                          key={label}
                          style={{
                            textAlign: "center",
                            fontSize: 11,
                            color: C.faint,
                            fontWeight: 800,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                          }}
                        >
                          {label}
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 8 }}>
                      {calendarDays.map((day) => {
                        const active = day.key === calendarSelectedDate;
                        const today = day.key === formatDateKey(new Date());
                        const completedCount = day.events.filter((event) => event.completed).length;
                        return (
                          <button
                            key={day.key}
                            type="button"
                            onClick={() => setCalendarSelectedDate(day.key)}
                            style={{
                              minHeight: width < 640 ? 68 : 86,
                              borderRadius: 14,
                              border: active
                                ? `1px solid ${C.accent}`
                                : today
                                  ? `1px solid #BFD1E5`
                                  : `1px solid ${C.border}`,
                              background: active ? C.accentLight : day.inMonth ? "#FFFFFF" : "#F4F1EB",
                              color: day.inMonth ? C.text : C.faint,
                              padding: 10,
                              textAlign: "left",
                              cursor: "pointer",
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "space-between",
                              gap: 8,
                            }}
                          >
                            <div style={{ fontSize: 13, fontWeight: 800 }}>{day.date.getDate()}</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {day.events.length ? (
                                <div style={{ fontSize: 10, fontWeight: 800, color: active ? C.accent : "#355E8A" }}>
                                  {day.events.length} item{day.events.length === 1 ? "" : "s"}
                                </div>
                              ) : null}
                              {completedCount ? (
                                <div style={{ fontSize: 10, color: C.accent }}>
                                  {completedCount} done
                                </div>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 14 }}>
                    <div
                      style={{
                        borderRadius: 18,
                        border: `1px solid ${C.border}`,
                        background: "#FCFBF8",
                        padding: 18,
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Selected Date
                      </div>
                      <div style={{ marginTop: 8, fontSize: 22, fontWeight: 900 }}>
                        {new Date(calendarSelectedDate).toLocaleDateString([], {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                        })}
                      </div>
                      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                        <input
                          value={calendarDraftTitle}
                          onChange={(event) => setCalendarDraftTitle(event.target.value)}
                          placeholder="Title for this date"
                          style={{ ...selectStyle, cursor: "text" }}
                        />
                        <select
                          value={calendarDraftType}
                          onChange={(event) => setCalendarDraftType(event.target.value)}
                          style={selectStyle}
                        >
                          {PLANNER_EVENT_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                        <select
                          value={calendarDraftSubject}
                          onChange={(event) => setCalendarDraftSubject(event.target.value)}
                          style={selectStyle}
                        >
                          <option value="">No subject tag</option>
                          {SUBJECT_OPTIONS.filter((value) => value !== "Mixed Review").map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                        <textarea
                          value={calendarDraftNote}
                          onChange={(event) => setCalendarDraftNote(event.target.value)}
                          placeholder="Optional note for this date"
                          style={{
                            ...selectStyle,
                            minHeight: 90,
                            resize: "vertical",
                            cursor: "text",
                          }}
                        />
                        <button
                          type="button"
                          onClick={addCalendarEvent}
                          style={{
                            padding: "11px 14px",
                            borderRadius: 12,
                            border: "none",
                            background: C.accent,
                            color: "#fff",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          Save calendar entry
                        </button>
                      </div>

                      <div
                        style={{
                          marginTop: 14,
                          borderTop: `1px solid ${C.border}`,
                          paddingTop: 14,
                          display: "grid",
                          gap: 10,
                        }}
                      >
                        <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Entries On This Date
                        </div>
                        {selectedDateEvents.length ? (
                          selectedDateEvents.map((event) => (
                            <div
                              key={event.id}
                              style={{
                                padding: "12px 14px",
                                borderRadius: 14,
                                background: "#FFFFFF",
                                border: `1px solid ${C.border}`,
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                  <Badge label={event.type} color="blue" />
                                  {event.subject ? <Badge label={event.subject} color="gray" /> : null}
                                  {event.completed ? <Badge label="done" color="green" /> : null}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => toggleCalendarEvent(event.id)}
                                  style={{
                                    padding: "7px 10px",
                                    borderRadius: 10,
                                    border: `1px solid ${C.border}`,
                                    background: C.surface,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  {event.completed ? "Reopen" : "Done"}
                                </button>
                              </div>
                              <div style={{ marginTop: 8, fontSize: 14, fontWeight: 800 }}>{event.title}</div>
                              {event.note ? (
                                <div style={{ marginTop: 6, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
                                  {event.note}
                                </div>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => deleteCalendarEvent(event.id)}
                                style={{
                                  marginTop: 8,
                                  padding: 0,
                                  border: "none",
                                  background: "transparent",
                                  color: C.red,
                                  fontSize: 12,
                                  fontWeight: 800,
                                  cursor: "pointer",
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          ))
                        ) : (
                          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                            Nothing is scheduled for this date yet.
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          marginTop: 14,
                          borderTop: `1px solid ${C.border}`,
                          paddingTop: 14,
                          display: "grid",
                          gap: 10,
                        }}
                      >
                        <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Upcoming
                        </div>
                        {upcomingEvents.length ? (
                          upcomingEvents.map((event) => (
                            <div
                              key={`${event.id}-upcoming`}
                              style={{
                                padding: "10px 12px",
                                borderRadius: 12,
                                background: "#FFFFFF",
                                border: `1px solid ${C.border}`,
                                fontSize: 12,
                                lineHeight: 1.7,
                              }}
                            >
                              <strong style={{ color: C.text }}>{event.title}</strong>
                              <div style={{ color: C.muted }}>
                                {event.date} | {event.type}{event.subject ? ` | ${event.subject}` : ""}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                            No upcoming calendar entries yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {mode === "planner" ? (
              <div style={panelStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    marginBottom: 18,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17 }}>Study Planner</div>
                    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
                      Turn weak areas and upcoming study blocks into named targets with due dates you can revisit.
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Badge label={`${plannerCompletionRate}% complete`} color={plannerCompletionRate >= 60 ? "green" : plannerCompletionRate >= 30 ? "amber" : "gray"} />
                    {overduePlannerItems.length ? <Badge label={`${overduePlannerItems.length} overdue`} color="red" /> : null}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: width < 1100 ? "1fr" : "minmax(320px, 0.9fr) minmax(0, 1.1fr)",
                    gap: 18,
                  }}
                >
                  <div
                    style={{
                      borderRadius: 18,
                      border: `1px solid ${C.border}`,
                      background: "#FCFBF8",
                      padding: 18,
                    }}
                  >
                    <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Add Planner Item
                    </div>
                    <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                      <input
                        value={plannerTitle}
                        onChange={(event) => setPlannerTitle(event.target.value)}
                        placeholder="What do you want to complete?"
                        style={{ ...selectStyle, cursor: "text" }}
                      />
                      <select value={plannerSubject} onChange={(event) => setPlannerSubject(event.target.value)} style={selectStyle}>
                        <option value="">No subject tag</option>
                        {SUBJECT_OPTIONS.filter((value) => value !== "Mixed Review").map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                      <select value={plannerMode} onChange={(event) => setPlannerMode(event.target.value)} style={selectStyle}>
                        {PLANNER_MODE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={plannerDueDate}
                        onChange={(event) => setPlannerDueDate(event.target.value)}
                        style={{ ...selectStyle, cursor: "pointer" }}
                      />
                      <textarea
                        value={plannerNotes}
                        onChange={(event) => setPlannerNotes(event.target.value)}
                        placeholder="Optional note, strategy, or reminder"
                        style={{
                          ...selectStyle,
                          minHeight: 96,
                          resize: "vertical",
                          cursor: "text",
                        }}
                      />
                      <button
                        type="button"
                        onClick={addPlannerItem}
                        style={{
                          padding: "11px 14px",
                          borderRadius: 12,
                          border: "none",
                          background: C.accent,
                          color: "#fff",
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        Save planner item
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 14 }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: width < 900 ? "1fr" : "repeat(3, minmax(0, 1fr))",
                        gap: 12,
                      }}
                    >
                      {[
                        {
                          label: "Open items",
                          value: plannerOpenItems.length,
                          helper: plannerRecommendedItem ? plannerSummaryLine : "Nothing active yet",
                        },
                        {
                          label: "Completed",
                          value: plannerItems.filter((item) => item.completed).length,
                          helper: plannerItems.length ? "Tracked in this account" : "No completions yet",
                        },
                        {
                          label: "Overdue",
                          value: overduePlannerItems.length,
                          helper: overduePlannerItems.length ? "Needs rescheduling or completion" : "Everything is on schedule",
                        },
                      ].map((item) => (
                        <div
                          key={item.label}
                          style={{
                            borderRadius: 16,
                            padding: 16,
                            border: `1px solid ${C.border}`,
                            background: "#FCFBF8",
                          }}
                        >
                          <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                            {item.label}
                          </div>
                          <div style={{ marginTop: 10, fontSize: 30, fontWeight: 900 }}>{item.value}</div>
                          <div style={{ marginTop: 6, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>{item.helper}</div>
                        </div>
                      ))}
                    </div>

                    <div
                      style={{
                        borderRadius: 18,
                        border: `1px solid ${C.border}`,
                        background: "#FCFBF8",
                        padding: 18,
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Active Planner Items
                      </div>
                      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                        {plannerItems.length ? (
                          sortByDateAsc(plannerItems, "dueDate").map((item) => (
                            <div
                              key={item.id}
                              style={{
                                padding: "14px 16px",
                                borderRadius: 14,
                                background: "#FFFFFF",
                                border: `1px solid ${item.completed ? "#BEE5C9" : item.dueDate && item.dueDate < formatDateKey(new Date()) ? "#F5B9C0" : C.border}`,
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                  <Badge label={item.completed ? "complete" : "active"} color={item.completed ? "green" : item.dueDate && item.dueDate < formatDateKey(new Date()) ? "red" : "blue"} />
                                  {item.subject ? <Badge label={item.subject} color="gray" /> : null}
                                </div>
                                <div style={{ fontSize: 12, color: C.muted }}>
                                  {item.dueDate ? `Due ${item.dueDate}` : "No due date"}
                                </div>
                              </div>
                              <div style={{ marginTop: 10, fontSize: 15, fontWeight: 800 }}>{item.title}</div>
                              {item.notes ? (
                                <div style={{ marginTop: 6, fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                                  {item.notes}
                                </div>
                              ) : null}
                              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  onClick={() => togglePlannerItem(item.id)}
                                  style={{
                                    padding: "8px 12px",
                                    borderRadius: 10,
                                    border: `1px solid ${C.border}`,
                                    background: C.surface,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  {item.completed ? "Mark open" : "Mark complete"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => addPlannerItemToCalendar(item)}
                                  style={{
                                    padding: "8px 12px",
                                    borderRadius: 10,
                                    border: `1px solid ${C.border}`,
                                    background: C.surface,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  Add to calendar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (item.subject) {
                                      setSubject(item.subject);
                                    }
                                    setMode(item.mode === "mixed" ? "flashcard" : item.mode);
                                    setStatusMessage("Planner target opened in the workspace.");
                                  }}
                                  style={{
                                    padding: "8px 12px",
                                    borderRadius: 10,
                                    border: `1px solid ${C.accentMid}`,
                                    background: C.accentLight,
                                    color: C.accent,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  Open workspace
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deletePlannerItem(item.id)}
                                  style={{
                                    padding: "8px 12px",
                                    borderRadius: 10,
                                    border: `1px solid ${C.red}`,
                                    background: C.redLight,
                                    color: C.red,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                            No planner items yet. Add one on the left to turn the dashboard into a real study plan.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {mode === "history" ? (
              <div style={panelStyle}>
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>
                  Review History
                </div>
                {reviewSessions.length ? (
                  <div style={{ display: "grid", gap: 12 }}>
                    {reviewSessions.map((session) => (
                      <SavedSessionCard
                        key={session.id}
                        session={session}
                        onOpen={openSavedQuiz}
                        onDelete={deleteSavedQuiz}
                      />
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                    Submit a flashcard or quiz session and it will appear here for review later.
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <footer
        style={{
          borderTop: `1px solid ${C.border}`,
          padding: "16px 24px",
          textAlign: "center",
          color: C.faint,
          fontSize: 12,
        }}
      >
        CareDrop | subject-focused flashcards and quizzes with Gemini support
      </footer>

      {statusMessage ? (
        <div
          style={{
            position: "fixed",
            right: isMobile ? 12 : 18,
            left: isMobile ? 12 : "auto",
            bottom: isMobile ? 76 : 82,
            zIndex: 95,
            maxWidth: isMobile ? "none" : 360,
            padding: "12px 14px",
            borderRadius: 14,
            border: `1px solid ${C.accentMid}`,
            background: C.accentLight,
            color: C.text,
            boxShadow: "0 16px 30px rgba(45, 106, 79, 0.16)",
            opacity: statusFading ? 0 : 1,
            transform: statusFading ? "translateY(12px)" : "translateY(0)",
            transition: "opacity 0.8s ease, transform 0.8s ease",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800, color: C.accent, marginBottom: 4 }}>
            Success
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            {statusMessage}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          setRequestStatus("");
          setRequestModalOpen(true);
        }}
        style={{
          position: "fixed",
          right: isMobile ? 12 : 18,
          bottom: isMobile ? 12 : 18,
          zIndex: 90,
          border: "none",
          borderRadius: 999,
          background: C.accent,
          color: "#fff",
          width: isMobile ? 48 : 52,
          height: isMobile ? 48 : 52,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 14px 26px rgba(45, 106, 79, 0.28)",
          cursor: "pointer",
        }}
        title="Open request or report form"
        aria-label="Open request or report form"
      >
        <MessageCircleMore size={22} />
      </button>

      {hasRequestDraft && !requestModalOpen ? (
        <div
          style={{
            position: "fixed",
            right: isMobile ? 12 : 18,
            bottom: isMobile ? 68 : 78,
            zIndex: 89,
            padding: "8px 12px",
            borderRadius: 999,
            background: "#FFF9EC",
            border: `1px solid ${C.amber}`,
            color: C.amber,
            fontSize: 12,
            fontWeight: 700,
            boxShadow: "0 12px 24px rgba(231, 111, 0, 0.12)",
          }}
        >
          Draft saved
        </div>
      ) : null}

      <RequestModal
        open={requestModalOpen}
        onClose={() => setRequestModalOpen(false)}
        onDiscard={() => {
          clearRequestDraft();
          setRequestModalOpen(false);
        }}
        requestType={requestType}
        setRequestType={setRequestType}
        requestName={requestName}
        setRequestName={setRequestName}
        requestMessage={requestMessage}
        setRequestMessage={setRequestMessage}
        onSubmit={submitRequest}
        requestHistory={requestHistory}
        requestStatus={requestStatus}
        requestLoading={requestLoading}
        requestConfigured={requestConfigured}
      />
    </div>
  );
}


