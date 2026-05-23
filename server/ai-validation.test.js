import { describe, expect, it } from "vitest";

import { generateValidatedQuestions, validateQuestion, validateSummary } from "./ai-validation.js";

describe("ai-validation", () => {
  it("retries malformed MCQs until they become valid", async () => {
    let attempt = 0;
    const fakeGenerateJson = async () => {
      attempt += 1;
      if (attempt === 1) {
        return {
          questions: [
            {
              subject: "Pharmacology",
              difficulty: "medium",
              topic: "cardio",
              prompt: "Which drug is best?",
              correctAnswer: "Pharmacology clue",
              options: ["Pharmacology clue", "Pharmacology clue", "B", "C"],
              rationale: "short",
              notes: "n",
            },
          ],
        };
      }

      return {
        questions: [
          {
            subject: "Pharmacology",
            difficulty: "medium",
            topic: "cardio",
            prompt: "Which action best fits a patient receiving digoxin with a low pulse?",
            correctAnswer: "Hold the medication and assess the apical pulse again before notifying the provider.",
            options: [
              "Hold the medication and assess the apical pulse again before notifying the provider.",
              "Give the medication with food to reduce nausea.",
              "Administer the dose early to avoid a missed level.",
              "Increase the next dose if the pulse stays low.",
            ],
            rationale:
              "Correct Answer Explanation: A low pulse can signal digoxin-related risk, so holding and reassessing is the safest next nursing action. Incorrect Options Explanation: Giving with food does not address bradycardia; giving early increases risk; increasing the dose is unsafe. Key Takeaway: Check apical pulse and safety cues before giving cardiac medications.",
            notes: "Focus on the safest nursing priority.",
          },
        ],
      };
    };

    const questions = await generateValidatedQuestions({
      client: {},
      generateJson: fakeGenerateJson,
      systemInstruction: "test",
      prompt: "test",
      count: 1,
      difficulty: "medium",
      logger: { warn() {}, error() {} },
    });

    expect(attempt).toBe(2);
    expect(questions).toHaveLength(1);
    expect(questions[0].options).toHaveLength(4);
  });

  it("rejects SATA items with only one correct answer or every option correct", () => {
    const base = {
      subject: "Medical-Surgical Nursing",
      difficulty: "hard",
      topic: "respiratory priority",
      type: "multiple_response",
      prompt: "The nurse cares for a client with worsening dyspnea and low oxygen saturation. Which actions are appropriate? Select all that apply.",
      correctAnswer: "",
      options: [
        { id: "a", text: "Assess respiratory effort", rationale: "Assessment confirms severity." },
        { id: "b", text: "Apply oxygen as prescribed", rationale: "Oxygen supports gas exchange." },
        { id: "c", text: "Delay reassessment until the next shift", rationale: "This delays needed care." },
        { id: "d", text: "Place the client flat in bed", rationale: "This can worsen breathing." },
      ],
      rationale:
        "Correct Answer Explanation: Respiratory assessment and oxygen support address immediate breathing needs. Incorrect Options Explanation: Delaying reassessment and lying flat are less appropriate because they can worsen instability. Key Takeaway: Prioritize breathing and rapid reassessment when oxygenation declines.",
      notes: "Prioritize breathing and oxygenation.",
    };

    expect(validateQuestion({ ...base, correctOptionIds: ["a"] }, 0, "hard")).toContain(
      "question 1: SATA items need at least two correctOptionIds"
    );
    expect(validateQuestion({ ...base, correctOptionIds: ["a", "b", "c", "d"] }, 0, "hard")).toContain(
      "question 1: SATA items cannot have every option marked correct"
    );
  });

  it("requires structured reviewer summaries", () => {
    const summary = `
Key Concepts
- Shock reduces tissue perfusion and requires prompt nursing assessment.
Important Terms
- Perfusion: delivery of oxygenated blood to tissues.
Signs and Symptoms
- Monitor hypotension, tachycardia, altered mental status, and cool clammy skin.
Nursing Interventions
- Prioritize airway, breathing, circulation, oxygen, IV access, and provider notification.
Patient Teaching
- Teach early reporting of dizziness, bleeding, fever, or worsening shortness of breath.
Safety Considerations
- Watch for rapid deterioration and contraindications before giving fluids or medications.
Knowledge Check Traps
- Do not delay assessment to complete nonurgent documentation.
High-Yield Review Points
- The safest first action usually addresses circulation, oxygenation, and rapid reassessment.
`;

    expect(validateSummary(summary)).toEqual([]);
    expect(validateSummary("Short recap only.")).toContain("summary is too short to be useful as a reviewer");
  });

  it("rejects summaries that drift away from uploaded source content", () => {
    const source =
      "Shock causes ineffective tissue perfusion with tachycardia, cool clammy skin, weak pulses, delayed capillary refill, oliguria, respiratory distress, oxygen support, IV access, urine output monitoring, and rapid escalation.";
    const hallucinated = `
Key Concepts
- CVA or stroke interrupts blood flow to the brain and may be ischemic or hemorrhagic.
Important Terms
- Thrombolytic therapy includes alteplase or tPA for selected ischemic stroke patients.
Signs and Symptoms
- Monitor facial droop, arm weakness, speech difficulty, and sudden severe headache.
Nursing Interventions
- Prioritize neurological assessment and stroke-team activation.
Patient Teaching
- Teach FAST and stroke warning signs.
Safety Considerations
- Watch for intracranial bleeding after thrombolytic therapy.
Knowledge Check Traps
- Do not confuse TIA with completed stroke.
High-Yield Review Points
- Time is brain in acute stroke care.
`;

    expect(validateSummary(hallucinated, source)).toContain(
      "summary introduces unsupported topic content: stroke, cva, ischemic, hemorrhagic, thrombolytic"
    );
  });
});
