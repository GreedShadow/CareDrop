import React, { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "nursing-study-buddy-v1";
const subjects = ["Fundamentals", "Pharmacology", "Medical-Surgical", "Maternal & Newborn", "Pediatrics", "Psychiatric Nursing", "Community Health", "Leadership & Management", "Mixed Review"];
const encouragements = [
  "You've got this, future RN.",
  "One question at a time. Progress still counts.",
  "Take a breath. Trust what you know.",
  "Even a small study session is still a win.",
  "You are learning, not just testing yourself.",
  "Read carefully. You know more than you think.",
];

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function normalize(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

function sentenceSplit(text) {
  return String(text || "").replace(/\r/g, " ").split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 25);
}

function inferDifficulty(text) {
  const t = String(text || "").toLowerCase();
  if (["priority", "first", "best", "initial", "unstable", "delegate", "shock", "airway", "safety"].some((w) => t.includes(w))) return "hard";
  if (["monitor", "assess", "intervention", "teaching", "symptom", "medication"].some((w) => t.includes(w))) return "medium";
  return "easy";
}

function inferSubject(text) {
  const t = String(text || "").toLowerCase();
  if (/(drug|medication|dose|digoxin|insulin|heparin|side effect)/.test(t)) return "Pharmacology";
  if (/(postpartum|pregnan|labor|fetus|fundus|lochia|newborn)/.test(t)) return "Maternal & Newborn";
  if (/(child|infant|pediatric|newborn|adolescent)/.test(t)) return "Pediatrics";
  if (/(therapeutic|suicide|anxiety|depression|hallucination|psychi)/.test(t)) return "Psychiatric Nursing";
  if (/(community|prevention|immunization|public health|epidemi)/.test(t)) return "Community Health";
  if (/(delegate|uap|supervision|management|leadership|prioritization)/.test(t)) return "Leadership & Management";
  if (/(surgery|shock|respiratory|cardiac|pain|fluid|electrolyte|med-surg)/.test(t)) return "Medical-Surgical";
  return "Fundamentals";
}

function buildNoteSummary(text) {
  const parts = sentenceSplit(text).slice(0, 6);
  return parts.length ? parts.map((line, index) => `${index + 1}. ${line}`).join("\n") : "Paste or upload notes to generate a reviewer summary here.";
}

function generateCardsFromNotes(text, selectedSubject) {
  return sentenceSplit(text).slice(0, 20).map((sentence, index) => ({
    id: uid() + index,
    subject: selectedSubject === "Mixed Review" ? inferSubject(sentence) : selectedSubject,
    difficulty: inferDifficulty(sentence),
    question: "What key nursing point should be remembered from this note?",
    answer: sentence,
    rationale: "This item was generated from notes. Connect it to safety, prioritization, assessment, and nursing judgment.",
    notes: "Generated from notes for quick review.",
  }));
}

function buildDistractors(correct, cards) {
  const pool = cards.map((card) => card.answer).filter((answer) => normalize(answer) !== normalize(correct)).slice(0, 3);
  const fallback = ["Document the finding and continue to monitor.", "Reassess the patient later.", "Delay intervention until more data is available."];
  return [correct, ...pool, ...fallback].slice(0, 4).sort(() => Math.random() - 0.5);
}

function generateQuestionsFromCards(cards, difficulty, subject, count) {
  const bySubject = cards.filter((card) => (subject === "Mixed Review" ? true : card.subject === subject));
  const byDifficulty = bySubject.filter((card) => card.difficulty === difficulty);
  const source = byDifficulty.length ? byDifficulty : bySubject.length ? bySubject : cards;
  return Array.from({ length: Math.min(count, Math.max(source.length, 1)) }, (_, index) => {
    const card = source[index % source.length];
    return {
      id: uid() + index,
      prompt: card.question,
      correctAnswer: card.answer,
      userAnswer: null,
      options: buildDistractors(card.answer, cards),
      rationale: card.rationale,
      notes: card.notes,
      difficulty: card.difficulty,
      subject: card.subject,
    };
  });
}

const starterCards = [
  { id: uid(), subject: "Fundamentals", difficulty: "easy", question: "What is the priority action for a patient with airway obstruction?", answer: "Establish airway patency immediately.", rationale: "Airway comes first in the ABC framework.", notes: "Think ABC." },
  { id: uid(), subject: "Pharmacology", difficulty: "medium", question: "What should the nurse monitor before administering digoxin?", answer: "Check the apical pulse for 1 full minute.", rationale: "Digoxin can slow the heart rate.", notes: "A low apical pulse is a hold warning." },
  { id: uid(), subject: "Medical-Surgical", difficulty: "hard", question: "A patient has BP 80/50 mmHg and HR 124 bpm after surgery. What is the priority nursing action?", answer: "Assess for shock and begin immediate supportive interventions.", rationale: "Hypotension with tachycardia may indicate shock.", notes: "Escalate early for unstable vitals." },
  { id: uid(), subject: "Maternal & Newborn", difficulty: "medium", question: "What is the expected fundal location immediately after delivery?", answer: "At the level of the umbilicus.", rationale: "This is a normal immediate postpartum finding.", notes: "A boggy fundus may suggest uterine atony." },
];

const styles = {
  page: { minHeight: "100vh", background: "linear-gradient(135deg, #fff1f2 0%, #fdf2f8 45%, #eff6ff 100%)", padding: 16, fontFamily: "Segoe UI, sans-serif", color: "#1f2937" },
  container: { maxWidth: 1180, margin: "0 auto" },
  card: { background: "rgba(255,255,255,0.92)", borderRadius: 24, padding: 20, boxShadow: "0 10px 24px rgba(15,23,42,0.08)" },
  row: { display: "flex", gap: 12, flexWrap: "wrap" },
  input: { width: "100%", padding: 12, borderRadius: 14, border: "1px solid #cbd5e1", boxSizing: "border-box", fontSize: 14 },
  button: { border: "none", borderRadius: 16, padding: "12px 16px", background: "#0f172a", color: "white", cursor: "pointer", fontWeight: 600 },
  secondaryButton: { border: "1px solid #cbd5e1", borderRadius: 16, padding: "12px 16px", background: "white", color: "#0f172a", cursor: "pointer", fontWeight: 600 },
  badge: { display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#f1f5f9", fontSize: 12, marginRight: 8, marginBottom: 8 },
};

export default function App() {
  const [cards, setCards] = useState(starterCards);
  const [subject, setSubject] = useState("Mixed Review");
  const [difficulty, setDifficulty] = useState("medium");
  const [studyMode, setStudyMode] = useState("flashcards");
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [quiz, setQuiz] = useState([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [encouragement, setEncouragement] = useState(encouragements[0]);
  const [focusTopic, setFocusTopic] = useState("");
  const [pastedNotes, setPastedNotes] = useState("");
  const [sourceNotes, setSourceNotes] = useState("");
  const [notesSummary, setNotesSummary] = useState("Paste or upload notes to generate a reviewer summary here.");
  const [savedSessions, setSavedSessions] = useState([]);
  const [usedAiQuestions, setUsedAiQuestions] = useState([]);
  const [aiStatus, setAiStatus] = useState("Claude is ready once your server has an API key.");
  const [isAiLoading, setIsAiLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (parsed.cards) setCards(parsed.cards);
      if (parsed.notesSummary) setNotesSummary(parsed.notesSummary);
      if (parsed.savedSessions) setSavedSessions(parsed.savedSessions);
      if (parsed.usedAiQuestions) setUsedAiQuestions(parsed.usedAiQuestions);
      if (parsed.focusTopic) setFocusTopic(parsed.focusTopic);
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ cards, notesSummary, savedSessions, usedAiQuestions, focusTopic }));
  }, [cards, notesSummary, savedSessions, usedAiQuestions, focusTopic]);

  const filteredCards = useMemo(() => cards.filter((card) => (subject === "Mixed Review" ? true : card.subject === subject)), [cards, subject]);
  const currentCard = filteredCards[currentCardIndex % Math.max(1, filteredCards.length)];
  const quizItem = quiz[quizIndex];
  const activeNotes = (pastedNotes || sourceNotes).trim();
  const allowRepeats = Boolean(activeNotes);

  function pickEncouragement() {
    setEncouragement(encouragements[Math.floor(Math.random() * encouragements.length)]);
  }

  function startLocalQuiz() {
    setQuiz(generateQuestionsFromCards(cards, difficulty, subject, 20));
    setQuizIndex(0);
    setShowFeedback(false);
    setStudyMode("quiz");
    pickEncouragement();
  }

  async function callClaude(path, body) {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Claude request failed.");
    return data;
  }

  async function generateClaudeSummary() {
    if (!activeNotes) return setAiStatus("Paste notes or upload a file before asking Claude to summarize.");
    setIsAiLoading(true);
    try {
      const data = await callClaude("/api/claude/summary", { notes: activeNotes });
      setNotesSummary(data.summary || notesSummary);
      setStudyMode("notes");
      setAiStatus("Claude summary generated.");
    } catch (error) {
      setAiStatus(error.message);
    } finally {
      setIsAiLoading(false);
    }
  }

  async function generateClaudeCards() {
    if (!activeNotes && !focusTopic.trim() && subject === "Mixed Review") return setAiStatus("Choose a subject, enter a topic, or provide notes before asking Claude to make cards.");
    setIsAiLoading(true);
    try {
      const data = await callClaude("/api/claude/cards", { notes: activeNotes, subject, topic: focusTopic.trim(), excludeQuestions: allowRepeats ? [] : usedAiQuestions });
      const imported = Array.isArray(data.cards) ? data.cards.map((item, index) => ({ id: uid() + index, subject: item.subject || subject, difficulty: item.difficulty || "medium", question: item.question, answer: item.answer, rationale: item.rationale, notes: item.notes })) : [];
      setCards((prev) => [...imported, ...prev]);
      if (!allowRepeats) setUsedAiQuestions((prev) => [...new Set([...prev, ...imported.map((item) => item.question)])].slice(-300));
      setAiStatus(`Claude generated ${imported.length} study cards.`);
      setStudyMode("flashcards");
    } catch (error) {
      setAiStatus(error.message);
    } finally {
      setIsAiLoading(false);
    }
  }

  async function generateClaudeQuiz() {
    if (!activeNotes && !focusTopic.trim() && subject === "Mixed Review") return setAiStatus("Choose a subject, enter a topic, or provide notes before asking Claude to make a quiz.");
    setIsAiLoading(true);
    try {
      const data = await callClaude("/api/claude/quiz", { notes: activeNotes, subject, topic: focusTopic.trim(), difficulty, count: 20, excludeQuestions: allowRepeats ? [] : usedAiQuestions });
      const generatedQuiz = Array.isArray(data.questions) ? data.questions.map((item, index) => ({ id: uid() + index, prompt: item.prompt, correctAnswer: item.correctAnswer, userAnswer: null, options: item.options || [], rationale: item.rationale, notes: item.notes, difficulty: item.difficulty || difficulty, subject: item.subject || subject })) : [];
      setQuiz(generatedQuiz);
      setQuizIndex(0);
      setShowFeedback(false);
      setStudyMode("quiz");
      if (!allowRepeats) setUsedAiQuestions((prev) => [...new Set([...prev, ...generatedQuiz.map((item) => item.prompt)])].slice(-300));
      setAiStatus(`Claude generated ${generatedQuiz.length} quiz questions.`);
      pickEncouragement();
    } catch (error) {
      setAiStatus(error.message);
    } finally {
      setIsAiLoading(false);
    }
  }

  function saveQuiz() {
    if (!quiz.length) return;
    setSavedSessions((prev) => [{ id: uid(), savedAt: new Date().toISOString(), subject, difficulty, topic: focusTopic.trim(), notesBacked: allowRepeats, quiz }, ...prev].slice(0, 12));
    setAiStatus("Quiz session saved for review.");
  }

  function loadSession(session) {
    setQuiz(session.quiz || []);
    setQuizIndex(0);
    setShowFeedback(false);
    setSubject(session.subject || "Mixed Review");
    setDifficulty(session.difficulty || "medium");
    setFocusTopic(session.topic || "");
    setStudyMode("quiz");
  }

  function handleAnswer(option) {
    if (!quizItem || quizItem.userAnswer !== null) return;
    const updated = [...quiz];
    updated[quizIndex] = { ...updated[quizIndex], userAnswer: option };
    setQuiz(updated);
    setShowFeedback(true);
  }

  function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result || "");
      const generated = generateCardsFromNotes(text, subject);
      setCards((prev) => [...generated, ...prev]);
      setSourceNotes(text);
      setPastedNotes(text);
      setNotesSummary(buildNoteSummary(text));
    };
    reader.readAsText(file);
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={styles.card}>
            <h1 style={{ margin: 0, fontSize: 30 }}>CareDrop Nursing Study Buddy</h1>
            <p style={{ color: "#64748b" }}>Subject-focused review with Claude summaries, flashcards, quizzes, and saved sessions.</p>
            <div style={styles.row}>
              <select style={styles.input} value={subject} onChange={(e) => setSubject(e.target.value)}>{subjects.map((item) => <option key={item}>{item}</option>)}</select>
              <select style={styles.input} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select>
              <input style={styles.input} value={focusTopic} onChange={(e) => setFocusTopic(e.target.value)} placeholder="Topic focus" />
            </div>
            <div style={{ ...styles.row, marginTop: 12 }}>
              <button style={styles.button} onClick={() => { setStudyMode("flashcards"); pickEncouragement(); }}>Flashcards</button>
              <button style={styles.secondaryButton} onClick={startLocalQuiz}>Local Quiz</button>
              <button style={styles.secondaryButton} onClick={generateClaudeQuiz} disabled={isAiLoading}>{isAiLoading ? "Claude Working..." : "Claude Quiz"}</button>
              <button style={styles.secondaryButton} onClick={saveQuiz}>Save Quiz</button>
            </div>
            <div style={{ marginTop: 12, padding: 14, borderRadius: 16, background: "linear-gradient(90deg, #ffe4e6, #e0f2fe)" }}>{encouragement}</div>
          </div>

          <div style={styles.card}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Notes + Claude</div>
            <input type="file" accept=".txt,.md,.json" onChange={handleUpload} />
            <textarea style={{ ...styles.input, minHeight: 150, marginTop: 12 }} value={pastedNotes} onChange={(e) => setPastedNotes(e.target.value)} placeholder="Paste notes here" />
            <div style={{ ...styles.row, marginTop: 12 }}>
              <button style={styles.button} onClick={() => { const generated = generateCardsFromNotes(pastedNotes, subject); setCards((prev) => [...generated, ...prev]); setSourceNotes(pastedNotes); setNotesSummary(buildNoteSummary(pastedNotes)); }}>Generate Study Cards</button>
              <button style={styles.secondaryButton} onClick={() => setNotesSummary(buildNoteSummary(pastedNotes || sourceNotes))}>Make Summary Notes</button>
              <button style={styles.secondaryButton} onClick={generateClaudeSummary} disabled={isAiLoading}>Claude Summary</button>
              <button style={styles.secondaryButton} onClick={generateClaudeCards} disabled={isAiLoading}>Claude Cards</button>
            </div>
            <div style={{ marginTop: 12, padding: 14, borderRadius: 16, background: "#f8fafc", whiteSpace: "pre-wrap" }}>{notesSummary}</div>
            <div style={{ marginTop: 12, padding: 14, borderRadius: 16, background: "#f8fafc", color: "#475569" }}>{aiStatus}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
            {studyMode === "flashcards" && currentCard && (
              <div style={styles.card}>
                <span style={styles.badge}>{currentCard.subject}</span>
                <span style={styles.badge}>{currentCard.difficulty}</span>
                <div onClick={() => setFlipped((value) => !value)} style={{ marginTop: 12, cursor: "pointer", padding: 20, borderRadius: 24, background: "linear-gradient(135deg, #ffe4e6 0%, #ffffff 50%, #e0f2fe 100%)" }}>
                  <div style={{ color: "#64748b", fontSize: 12 }}>{flipped ? "Answer" : "Question"}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{flipped ? currentCard.answer : currentCard.question}</div>
                  {flipped && <div style={{ marginTop: 12, color: "#475569" }}>{currentCard.rationale}</div>}
                </div>
                <div style={{ ...styles.row, marginTop: 12 }}>
                  <button style={styles.secondaryButton} onClick={() => setCurrentCardIndex((value) => (value - 1 + filteredCards.length) % filteredCards.length)}>Prev</button>
                  <button style={styles.secondaryButton} onClick={() => setCurrentCardIndex((value) => (value + 1) % filteredCards.length)}>Next</button>
                </div>
              </div>
            )}

            {studyMode === "quiz" && (
              <div style={styles.card}>
                {!quizItem ? <div>No quiz yet. Start one above.</div> : (
                  <>
                    <span style={styles.badge}>Q {quizIndex + 1} of {quiz.length}</span>
                    <span style={styles.badge}>{quizItem.subject}</span>
                    <span style={styles.badge}>{quizItem.difficulty}</span>
                    <div style={{ marginTop: 12, padding: 20, borderRadius: 24, background: "#f8fafc" }}>
                      <div style={{ color: "#64748b", fontSize: 12 }}>Question</div>
                      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8 }}>{quizItem.prompt}</div>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      {quizItem.options.map((option) => (
                        <button key={option} style={{ ...styles.secondaryButton, width: "100%", textAlign: "left", marginBottom: 10 }} disabled={quizItem.userAnswer !== null} onClick={() => handleAnswer(option)}>{option}</button>
                      ))}
                    </div>
                    {showFeedback && <div style={{ marginTop: 12, padding: 16, borderRadius: 16, background: normalize(quizItem.userAnswer) === normalize(quizItem.correctAnswer) ? "#ecfdf5" : "#fff1f2" }}>
                      <div><strong>Your answer:</strong> {quizItem.userAnswer}</div>
                      <div><strong>Correct answer:</strong> {quizItem.correctAnswer}</div>
                      <div><strong>Rationale:</strong> {quizItem.rationale}</div>
                      <button style={{ ...styles.button, marginTop: 12 }} onClick={() => { setShowFeedback(false); setQuizIndex((value) => Math.min(value + 1, quiz.length - 1)); }}>Next Question</button>
                    </div>}
                  </>
                )}
              </div>
            )}
          </div>

          <div style={styles.card}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Saved Review Sessions</div>
            {!savedSessions.length ? <div style={{ color: "#64748b" }}>No saved sessions yet.</div> : savedSessions.map((session) => (
              <div key={session.id} style={{ padding: 14, borderRadius: 16, background: "#f8fafc", marginTop: 10 }}>
                <div style={{ fontWeight: 700 }}>{session.subject}{session.topic ? ` - ${session.topic}` : ""}</div>
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>{new Date(session.savedAt).toLocaleString()}</div>
                <div style={{ ...styles.row, marginTop: 10 }}>
                  <button style={styles.secondaryButton} onClick={() => loadSession(session)}>Review</button>
                  <button style={styles.secondaryButton} onClick={() => setSavedSessions((prev) => prev.filter((item) => item.id !== session.id))}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
