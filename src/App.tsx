import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, Brain, Heart, Upload, Sparkles, ClipboardCheck, RotateCcw, Star, CheckCircle2, XCircle, NotebookPen, Filter, Trophy, Clock3 } from "lucide-react";

const STORAGE_KEY = "nursing-study-buddy-v1";

const encouragements = [
  "You've got this, future RN ✨",
  "One question at a time. Progress still counts 💛",
  "Take a breath. Trust what you know 🌷",
  "Even a small study session is still a win 🌈",
  "You are learning, not just testing yourself 💙",
  "Read carefully. You know more than you think 🌟",
];

const subjects = [
  "Fundamentals",
  "Pharmacology",
  "Medical-Surgical",
  "Maternal & Newborn",
  "Pediatrics",
  "Psychiatric Nursing",
  "Community Health",
  "Leadership & Management",
  "Mixed Review",
];

interface StudyCard {
  id: string;
  subject: string;
  difficulty: "easy" | "medium" | "hard";
  question: string;
  answer: string;
  rationale: string;
  notes: string;
  tags?: string[];
}

interface QuizItem extends StudyCard {
  prompt: string;
  correctAnswer: string;
  userAnswer: string | null;
  options: string[];
  explanationTitle: string;
}

interface AppStats {
  attempted: number;
  correct: number;
  wrong: number;
  sessions: number;
}

interface SavedState {
  cards: StudyCard[];
  weakCardIds: string[];
  stats: AppStats;
  notesSummary: string;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

function sentenceSplit(text: string): string[] {
  return text
    .replace(/\r/g, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 25);
}

function extractKeywords(text: string): string[] {
  const stop = new Set([
    "the", "and", "for", "with", "that", "this", "from", "have", "are", "was", "were", "what", "when", "which", "into", "will", "your", "about", "them", "their", "then", "than", "also", "such", "should", "must", "after", "before", "because", "while", "where", "there", "these", "those", "through", "patient", "nurse", "nursing"
  ]);
  return [...new Set(
    normalize(text)
      .split(/\s+/)
      .filter((w: string) => w.length > 4 && !stop.has(w))
  )].slice(0, 30);
}

function inferDifficulty(text: string): "easy" | "medium" | "hard" {
  const t = text.toLowerCase();
  if (["priority", "first", "best", "initial", "unstable", "delegate", "shock", "airway", "safety"].some((w: string) => t.includes(w))) return "hard";
  if (["monitor", "assess", "intervention", "teaching", "symptom", "medication"].some((w: string) => t.includes(w))) return "medium";
  return "easy";
}

function inferSubject(text: string): string {
  const t = text.toLowerCase();
  if (/(drug|medication|dose|digoxin|insulin|heparin|side effect)/.test(t)) return "Pharmacology";
  if (/(postpartum|pregnan|labor|fetus|fundus|lochia|newborn)/.test(t)) return "Maternal & Newborn";
  if (/(child|infant|pediatric|newborn|adolescent)/.test(t)) return "Pediatrics";
  if (/(therapeutic|suicide|anxiety|depression|hallucination|psychi)/.test(t)) return "Psychiatric Nursing";
  if (/(community|prevention|immunization|public health|epidemi)/.test(t)) return "Community Health";
  if (/(delegate|uap|supervision|management|leadership|prioritization)/.test(t)) return "Leadership & Management";
  if (/(surgery|shock|respiratory|cardiac|pain|fluid|electrolyte|med-surg)/.test(t)) return "Medical-Surgical";
  return "Fundamentals";
}

function buildDistractors(correct: string, pool: string[]): string[] {
  const candidates = shuffle(
    pool
      .filter((p: string) => p && normalize(p) !== normalize(correct))
      .filter((v: string, i: number, a: string[]) => a.findIndex((x: string) => normalize(x) === normalize(v)) === i)
  ).slice(0, 3);

  const fallback = [
    "Document the finding and continue to monitor.",
    "Reassess the patient after 1 hour.",
    "Delay intervention until more data is available.",
    "Delegate the task immediately to available staff.",
    "Provide reassurance without further assessment.",
    "Administer medication before reassessing.",
  ];

  while (candidates.length < 3) {
    const next = fallback[candidates.length];
    if (normalize(next) !== normalize(correct)) candidates.push(next);
  }

  return shuffle([correct, ...candidates]).slice(0, 4);
}

function generateQuestionsFromCards(cards: StudyCard[], difficulty: string, subject: string, count: number = 20): QuizItem[] {
  const filtered = cards.filter((c: StudyCard) => (subject === "Mixed Review" ? true : c.subject === subject) && c.difficulty === difficulty);
  const base = filtered.length ? filtered : cards.filter((c: StudyCard) => subject === "Mixed Review" ? true : c.subject === subject);
  const source = base.length ? base : cards;

  const allAnswers = cards.map((c: StudyCard) => c.answer);
  const repeated = Array.from({ length: Math.max(count, source.length) }, (_, i: number) => source[i % source.length]);

  return shuffle(repeated).slice(0, count).map((card: StudyCard, idx: number) => ({
    id: uid() + idx,
    prompt: card.question,
    correctAnswer: card.answer,
    userAnswer: null,
    options: buildDistractors(card.answer, allAnswers),
    rationale: card.rationale,
    notes: card.notes,
    difficulty: card.difficulty,
    subject: card.subject,
    question: card.question,
    answer: card.answer,
    tags: card.tags,
    explanationTitle: inferDifficulty(card.question) === "hard" ? "Clinical Rationale" : "Why this is correct",
  }));
}

function generateCardsFromNotes(text: string, selectedSubject: string = "Mixed Review"): StudyCard[] {
  const sentences = sentenceSplit(text).slice(0, 30);
  const keywords = extractKeywords(text);
  const cards: StudyCard[] = [];

  sentences.forEach((sentence: string, index: number) => {
    const trimmed = sentence.trim();
    if (trimmed.length < 30) return;

    const inferredSubject = selectedSubject === "Mixed Review" ? inferSubject(trimmed) : selectedSubject;
    const difficulty = inferDifficulty(trimmed);
    const keyword = keywords[index % Math.max(1, keywords.length)] || "concept";

    cards.push({
      id: uid(),
      subject: inferredSubject,
      difficulty,
      question: `From the notes, what is the key nursing point about ${keyword}?`,
      answer: trimmed,
      rationale: `This item was generated from the uploaded notes. It highlights a review-worthy point connected to ${keyword}. Use it as a recall cue, then connect it to safety, prioritization, and assessment during review.`,
      notes: `Generated from uploaded notes. Review the original wording for context.`,
      tags: ["Generated", difficulty],
    });
  });

  return cards.slice(0, 30);
}

function buildNoteSummary(text: string): string {
  const sentences = sentenceSplit(text).slice(0, 6);
  if (!sentences.length) return "Paste or upload notes to generate a reviewer summary here.";
  return sentences.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n");
}

const starterCards: StudyCard[] = [
  {
    id: uid(),
    subject: "Fundamentals",
    difficulty: "easy",
    question: "What is the priority action for a patient with airway obstruction?",
    answer: "Establish airway patency immediately.",
    rationale: "Airway comes first in the ABC framework. The nurse should act to clear or support the airway before addressing other concerns.",
    notes: "Think ABC: Airway, Breathing, Circulation.",
    tags: ["ABC", "Priority"],
  },
  {
    id: uid(),
    subject: "Pharmacology",
    difficulty: "medium",
    question: "What should the nurse monitor before administering digoxin?",
    answer: "Check the apical pulse for 1 full minute.",
    rationale: "Digoxin can slow the heart rate. If the pulse is below the prescribed threshold, the medication is often withheld and the provider notified.",
    notes: "Common hold parameter is under 60 bpm, depending on the order.",
    tags: ["Medication Safety", "Cardiac"],
  },
  {
    id: uid(),
    subject: "Medical-Surgical",
    difficulty: "hard",
    question: "A patient has BP 80/50 mmHg and HR 124 bpm after surgery. What is the priority nursing action?",
    answer: "Assess for shock and initiate immediate supportive interventions such as IV fluid support per protocol/order.",
    rationale: "Hypotension with tachycardia after surgery may suggest hypovolemia or shock. The nurse should recognize instability early and act quickly.",
    notes: "Unstable vital signs require rapid assessment and escalation.",
    tags: ["Shock", "Post-op"],
  },
  {
    id: uid(),
    subject: "Maternal & Newborn",
    difficulty: "medium",
    question: "What is the expected fundal location immediately after delivery?",
    answer: "At the level of the umbilicus.",
    rationale: "After birth, the uterus is typically firm and around the umbilicus before involution gradually lowers it.",
    notes: "Fundus high + boggy can suggest uterine atony.",
    tags: ["OB", "Postpartum"],
  },
  {
    id: uid(),
    subject: "Pediatrics",
    difficulty: "easy",
    question: "What is a classic sign of dehydration in an infant?",
    answer: "Sunken fontanelle.",
    rationale: "Infants with dehydration may show a sunken fontanelle, dry mucous membranes, and reduced urine output.",
    notes: "Always pair with I&O and behavior changes.",
    tags: ["Pedia", "Assessment"],
  },
  {
    id: uid(),
    subject: "Psychiatric Nursing",
    difficulty: "medium",
    question: "What is the best therapeutic response to a patient saying, 'Nobody cares about me.'?",
    answer: "'It sounds like you're feeling very alone right now.'",
    rationale: "Therapeutic communication reflects and validates the patient's feelings without judgment or false reassurance.",
    notes: "Avoid 'Don't say that' or changing the subject.",
    tags: ["Therapeutic Communication"],
  },
  {
    id: uid(),
    subject: "Community Health",
    difficulty: "easy",
    question: "Which level of prevention focuses on immunization?",
    answer: "Primary prevention.",
    rationale: "Primary prevention aims to prevent disease before it occurs through actions like vaccines and health promotion.",
    notes: "Secondary = early detection. Tertiary = limit disability.",
    tags: ["Prevention"],
  },
  {
    id: uid(),
    subject: "Leadership & Management",
    difficulty: "hard",
    question: "Which task is appropriate to delegate to unlicensed assistive personnel (UAP)?",
    answer: "Obtaining routine vital signs on a stable patient.",
    rationale: "Stable, routine, non-assessment tasks are often appropriate for delegation to UAP, while assessment and teaching remain nursing responsibilities.",
    notes: "Remember: assess, teach, evaluate, and unstable patients stay with the nurse.",
    tags: ["Delegation"],
  },
];

export default function NursingStudyBuddyApp(): React.ReactElement {
  const [cards, setCards] = useState<StudyCard[]>(starterCards);
  const [subject, setSubject] = useState<string>("Mixed Review");
  const [difficulty, setDifficulty] = useState<string>("medium");
  const [studyMode, setStudyMode] = useState<"flashcards" | "quiz" | "notes">("flashcards");
  const [currentCardIndex, setCurrentCardIndex] = useState<number>(0);
  const [flipped, setFlipped] = useState<boolean>(false);
  const [quiz, setQuiz] = useState<QuizItem[]>([]);
  const [quizIndex, setQuizIndex] = useState<number>(0);
  const [showFeedback, setShowFeedback] = useState<boolean>(false);
  const [encouragement, setEncouragement] = useState<string>(encouragements[0]);
  const [showEncouragement, setShowEncouragement] = useState<boolean>(false);
  const [pastedNotes, setPastedNotes] = useState<string>("");
  const [notesSummary, setNotesSummary] = useState<string>("Paste or upload notes to generate a reviewer summary here.");
  const [weakCardIds, setWeakCardIds] = useState<string[]>([]);
  const [stats, setStats] = useState<AppStats>({ attempted: 0, correct: 0, wrong: 0, sessions: 0 });
  const [uploadStatus, setUploadStatus] = useState<string>("No file uploaded yet.");
  const [filterWeakOnly, setFilterWeakOnly] = useState<boolean>(false);
  const [showStartDialog, setShowStartDialog] = useState<boolean>(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed: SavedState = JSON.parse(saved);
        if (parsed.cards?.length) setCards(parsed.cards);
        if (parsed.weakCardIds) setWeakCardIds(parsed.weakCardIds);
        if (parsed.stats) setStats(parsed.stats);
        if (parsed.notesSummary) setNotesSummary(parsed.notesSummary);
      } catch (e) {
        console.error("Failed to load app state", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ cards, weakCardIds, stats, notesSummary })
    );
  }, [cards, weakCardIds, stats, notesSummary]);

  const filteredCards = useMemo(() => {
    return cards.filter((c: StudyCard) => {
      const subjectMatch = subject === "Mixed Review" ? true : c.subject === subject;
      const weakMatch = filterWeakOnly ? weakCardIds.includes(c.id) : true;
      return subjectMatch && weakMatch;
    });
  }, [cards, subject, filterWeakOnly, weakCardIds]);

  const currentCard: StudyCard | undefined = filteredCards[currentCardIndex % Math.max(filteredCards.length, 1)];
  const answeredCount = quiz.filter((q: QuizItem) => q.userAnswer !== null).length;
  const correctCount = quiz.filter((q: QuizItem) => q.userAnswer !== null && normalize(q.userAnswer) === normalize(q.correctAnswer)).length;
  const progressPercent = quiz.length ? Math.round((answeredCount / quiz.length) * 100) : 0;
  const accuracyPercent = stats.attempted ? Math.round((stats.correct / stats.attempted) * 100) : 0;

  function pickEncouragement(): void {
    const msg = encouragements[Math.floor(Math.random() * encouragements.length)];
    setEncouragement(msg);
    setShowEncouragement(true);
  }

  function startQuiz(): void {
    const generated = generateQuestionsFromCards(cards, difficulty, subject, 20);
    setQuiz(generated);
    setQuizIndex(0);
    setShowFeedback(false);
    pickEncouragement();
    setShowStartDialog(false);
    setStats((s: AppStats) => ({ ...s, sessions: s.sessions + 1 }));
  }

  function handleAnswer(option: string): void {
    if (!quiz[quizIndex] || quiz[quizIndex].userAnswer !== null) return;

    pickEncouragement();
    const updated = [...quiz];
    updated[quizIndex] = { ...updated[quizIndex], userAnswer: option };
    setQuiz(updated);
    setShowFeedback(true);

    const isCorrect = normalize(option) === normalize(updated[quizIndex].correctAnswer);
    setStats((s: AppStats) => ({
      ...s,
      attempted: s.attempted + 1,
      correct: s.correct + (isCorrect ? 1 : 0),
      wrong: s.wrong + (isCorrect ? 0 : 1),
    }));

    if (!isCorrect) {
      const current = cards.find((c: StudyCard) => normalize(c.question) === normalize(updated[quizIndex].prompt));
      if (current && !weakCardIds.includes(current.id)) {
        setWeakCardIds((prev: string[]) => [...prev, current.id]);
      }
    }
  }

  function nextQuestion(): void {
    setShowFeedback(false);
    setShowEncouragement(false);
    setQuizIndex((i: number) => Math.min(i + 1, quiz.length - 1));
  }

  function prevCard(): void {
    setFlipped(false);
    setCurrentCardIndex((i: number) => (i - 1 + filteredCards.length) % Math.max(filteredCards.length, 1));
  }

  function nextCard(): void {
    setFlipped(false);
    setCurrentCardIndex((i: number) => (i + 1) % Math.max(filteredCards.length, 1));
  }

  function markCard(status: string): void {
    if (!currentCard) return;
    if (status === "again" && !weakCardIds.includes(currentCard.id)) {
      setWeakCardIds((prev: string[]) => [...prev, currentCard.id]);
    }
    if (status === "easy") {
      setWeakCardIds((prev: string[]) => prev.filter((id: string) => id !== currentCard.id));
    }
    nextCard();
  }

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      const text = String(e.target?.result || "");
      if (file.name.endsWith(".json")) {
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            const imported: StudyCard[] = parsed.map((item: any) => ({
              id: item.id || uid(),
              subject: item.subject || "Mixed Review",
              difficulty: item.difficulty || "medium",
              question: item.question || "Imported question",
              answer: item.answer || "Imported answer",
              rationale: item.rationale || "No rationale provided.",
              notes: item.notes || "",
              tags: item.tags || ["Imported"],
            }));
            setCards((prev: StudyCard[]) => [...imported, ...prev]);
            setUploadStatus(`Imported ${imported.length} cards from JSON.`);
            return;
          }
        } catch (err) {
          setUploadStatus("JSON file could not be read. Try a text file or valid deck JSON.");
          return;
        }
      }

      const generated = generateCardsFromNotes(text, subject);
      setCards((prev: StudyCard[]) => [...generated, ...prev]);
      setNotesSummary(buildNoteSummary(text));
      setUploadStatus(`Generated ${generated.length} study cards from ${file.name}.`);
    };
    reader.readAsText(file);
  }

  function generateFromPastedNotes(): void {
    if (!pastedNotes.trim()) return;
    const generated = generateCardsFromNotes(pastedNotes, subject);
    setCards((prev: StudyCard[]) => [...generated, ...prev]);
    setNotesSummary(buildNoteSummary(pastedNotes));
    setUploadStatus(`Generated ${generated.length} cards from pasted notes.`);
    setPastedNotes("");
  }

  function resetApp(): void {
    setCards(starterCards);
    setWeakCardIds([]);
    setStats({ attempted: 0, correct: 0, wrong: 0, sessions: 0 });
    setNotesSummary("Paste or upload notes to generate a reviewer summary here.");
    setUploadStatus("App reset to starter content.");
    localStorage.removeItem(STORAGE_KEY);
  }

  const quizItem: QuizItem | undefined = quiz[quizIndex];
  const isCurrentCorrect = quizItem?.userAnswer && normalize(quizItem.userAnswer) === normalize(quizItem.correctAnswer);

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-sky-50 p-4 md:p-8 text-slate-800">
      <div className="mx-auto max-w-7xl space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid gap-4 md:grid-cols-[1.3fr_0.7fr]"
        >
          <Card className="rounded-3xl border-0 shadow-lg bg-white/90 backdrop-blur">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-rose-100 p-3"><Heart className="h-5 w-5" /></div>
                <div>
                  <CardTitle className="text-2xl md:text-3xl">Nursing Study Buddy</CardTitle>
                  <CardDescription>
                    A cute but focused board-review app for quick recall, quizzes, rationales, and note-based review.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <StatCard icon={<BookOpen className="h-4 w-4" />} label="Total Cards" value={cards.length} />
              <StatCard icon={<Star className="h-4 w-4" />} label="Weak Cards" value={weakCardIds.length} />
              <StatCard icon={<ClipboardCheck className="h-4 w-4" />} label="Accuracy" value={`${accuracyPercent}%`} />
              <StatCard icon={<Trophy className="h-4 w-4" />} label="Sessions" value={stats.sessions} />
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-0 shadow-lg bg-white/90 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-5 w-5" /> Gentle Push</CardTitle>
              <CardDescription>Made to feel easy to start, even on low-energy study days.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl bg-gradient-to-r from-rose-100 to-sky-100 p-4 text-sm leading-6">
                {encouragement}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button className="rounded-2xl" onClick={() => { setStudyMode("flashcards"); pickEncouragement(); }}>Quick 5 Cards</Button>
                <Button variant="secondary" className="rounded-2xl" onClick={() => { setStudyMode("quiz"); setShowStartDialog(true); }}>20-Question Quiz</Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-6">
            <Card className="rounded-3xl border-0 shadow-lg bg-white/90">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" /> Study Controls</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Subject</label>
                  <Select value={subject} onValueChange={(v: string) => { setSubject(v); setCurrentCardIndex(0); }}>
                    <SelectTrigger className="rounded-2xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {subjects.map((s: string) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Difficulty</label>
                  <Select value={difficulty} onValueChange={(v: string) => setDifficulty(v)}>
                    <SelectTrigger className="rounded-2xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Mode</label>
                  <Tabs value={studyMode} onValueChange={(v: string) => setStudyMode(v as "flashcards" | "quiz" | "notes")} className="w-full">
                    <TabsList className="grid w-full grid-cols-3 rounded-2xl">
                      <TabsTrigger value="flashcards">Flashcards</TabsTrigger>
                      <TabsTrigger value="quiz">Quiz</TabsTrigger>
                      <TabsTrigger value="notes">Notes</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <div className="flex items-end gap-2">
                  <Button variant={filterWeakOnly ? "default" : "outline"} className="w-full rounded-2xl" onClick={() => setFilterWeakOnly((v: boolean) => !v)}>
                    {filterWeakOnly ? "Showing Weak Only" : "Show Weak Cards"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-lg bg-white/90">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Notes + File Upload</CardTitle>
                <CardDescription>
                  Upload .txt or .json decks, or paste notes to turn them into flashcards, reviewer notes, and quiz material.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input type="file" accept=".txt,.json,.md" onChange={handleFileUpload} className="rounded-2xl" />
                <div className="text-sm text-slate-600">{uploadStatus}</div>
                <Textarea
                  value={pastedNotes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPastedNotes(e.target.value)}
                  placeholder="Paste class notes, lecture reviewer, or nursing concepts here..."
                  className="min-h-[160px] rounded-2xl"
                />
                <div className="grid gap-2 md:grid-cols-2">
                  <Button className="rounded-2xl" onClick={generateFromPastedNotes}>Generate Study Cards</Button>
                  <Button variant="secondary" className="rounded-2xl" onClick={() => setNotesSummary(buildNoteSummary(pastedNotes || notesSummary))}>Make Summary Notes</Button>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 whitespace-pre-wrap">
                  <div className="mb-2 flex items-center gap-2 font-medium"><NotebookPen className="h-4 w-4" /> Quick Reviewer Summary</div>
                  {notesSummary}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-lg bg-white/90">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Brain className="h-5 w-5" /> AI-Ready Section</CardTitle>
                <CardDescription>
                  This starter app includes local note-to-card generation now and is structured so a real AI API can be connected later.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
                <div className="rounded-2xl bg-violet-50 p-4">
                  Suggested future AI actions: generate board-style questions, write rationales, summarize uploaded notes, and create hard-mode simulation scenarios.
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="rounded-2xl" disabled>Connect AI Key</Button>
                  <Button variant="outline" className="rounded-2xl" disabled>Generate with AI</Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <AnimatePresence mode="wait">
              {studyMode === "flashcards" && (
                <motion.div key="flashcards" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <Card className="rounded-3xl border-0 shadow-lg bg-white/90 overflow-hidden">
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Flashcards</CardTitle>
                          <CardDescription>
                            Tap the card to flip. Use Again / Hard / Easy to guide review.
                          </CardDescription>
                        </div>
                        <Badge className="rounded-full px-3 py-1">{filteredCards.length} cards</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {!currentCard ? (
                        <EmptyState title="No cards here yet" description="Try Mixed Review, upload notes, or turn off Weak Only filter." />
                      ) : (
                        <>
                          <motion.button
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setFlipped((f: boolean) => !f)}
                            className="w-full rounded-[2rem] bg-gradient-to-br from-rose-100 via-white to-sky-100 p-6 text-left shadow-inner min-h-[300px]"
                          >
                            <div className="mb-4 flex items-center justify-between">
                              <div className="flex gap-2 flex-wrap">
                                <Badge variant="secondary" className="rounded-full">{currentCard.subject}</Badge>
                                <Badge variant="outline" className="rounded-full capitalize">{currentCard.difficulty}</Badge>
                              </div>
                              <span className="text-xs text-slate-500">Tap to flip</span>
                            </div>
                            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">{flipped ? "Answer" : "Question"}</div>
                            <div className="text-lg md:text-2xl font-semibold leading-8">
                              {flipped ? currentCard.answer : currentCard.question}
                            </div>
                            {flipped && (
                              <div className="mt-6 rounded-2xl bg-white/80 p-4 text-sm leading-6 text-slate-700">
                                <div className="font-medium mb-1">Why it matters</div>
                                <div>{currentCard.rationale}</div>
                                {currentCard.notes && <div className="mt-2 text-slate-500">Tip: {currentCard.notes}</div>}
                              </div>
                            )}
                          </motion.button>

                          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                            <Button variant="outline" className="rounded-2xl" onClick={prevCard}>Prev</Button>
                            <Button variant="outline" className="rounded-2xl" onClick={() => markCard("again")}>Again</Button>
                            <Button variant="outline" className="rounded-2xl" onClick={() => markCard("hard")}>Hard</Button>
                            <Button className="rounded-2xl" onClick={() => markCard("easy")}>Easy</Button>
                            <Button variant="outline" className="rounded-2xl" onClick={nextCard}>Next</Button>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {studyMode === "quiz" && (
                <motion.div key="quiz" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <Card className="rounded-3xl border-0 shadow-lg bg-white/90">
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5" /> 20-Question Quiz</CardTitle>
                          <CardDescription>Choose easy, medium, or hard, then review every answer with a rationale.</CardDescription>
                        </div>
                        <Button className="rounded-2xl" onClick={() => setShowStartDialog(true)}>Start New Quiz</Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {!quizItem ? (
                        <EmptyState title="Ready for a quiz?" description="Tap Start New Quiz to generate 20 nursing review questions." />
                      ) : (
                        <>
                          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                            <div>
                              <div className="mb-2 flex items-center gap-2 flex-wrap">
                                <Badge className="rounded-full">Q {quizIndex + 1} of {quiz.length}</Badge>
                                <Badge variant="secondary" className="rounded-full">{quizItem.subject}</Badge>
                                <Badge variant="outline" className="rounded-full capitalize">{quizItem.difficulty}</Badge>
                              </div>
                              <Progress value={progressPercent} className="h-2" />
                            </div>
                            <div className="text-sm text-slate-500 flex items-center gap-1"><Clock3 className="h-4 w-4" /> {answeredCount} answered</div>
                          </div>

                          {showEncouragement && (
                            <div className="rounded-2xl bg-gradient-to-r from-amber-50 to-rose-50 p-4 text-sm font-medium">
                              {encouragement}
                            </div>
                          )}

                          <div className="rounded-[2rem] bg-slate-50 p-6">
                            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">Question</div>
                            <div className="text-lg md:text-xl font-semibold leading-8">{quizItem.prompt}</div>
                          </div>

                          <div className="grid gap-3">
                            {quizItem.options.map((option: string) => {
                              const selected = quizItem.userAnswer === option;
                              const correct = normalize(option) === normalize(quizItem.correctAnswer);
                              const showState = showFeedback && quizItem.userAnswer !== null;

                              return (
                                <Button
                                  key={option}
                                  variant="outline"
                                  disabled={quizItem.userAnswer !== null}
                                  onClick={() => handleAnswer(option)}
                                  className={`h-auto min-h-[64px] justify-start whitespace-normal rounded-2xl px-4 py-4 text-left ${showState && correct ? "border-emerald-500 bg-emerald-50" : ""} ${showState && selected && !correct ? "border-rose-500 bg-rose-50" : ""}`}
                                >
                                  {option}
                                </Button>
                              );
                            })}
                          </div>

                          {showFeedback && quizItem.userAnswer !== null && (
                            <div className={`rounded-[2rem] p-5 ${isCurrentCorrect ? "bg-emerald-50" : "bg-rose-50"}`}>
                              <div className="mb-3 flex items-center gap-2 font-semibold text-lg">
                                {isCurrentCorrect ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                                {isCurrentCorrect ? "Correct!" : "Incorrect"}
                              </div>
                              <div className="space-y-2 text-sm leading-6">
                                <div><span className="font-medium">Your answer:</span> {quizItem.userAnswer}</div>
                                <div><span className="font-medium">Correct answer:</span> {quizItem.correctAnswer}</div>
                                <div>
                                  <span className="font-medium">{quizItem.explanationTitle}:</span> {quizItem.rationale}
                                </div>
                                {quizItem.notes && <div><span className="font-medium">Memory tip:</span> {quizItem.notes}</div>}
                                {!isCurrentCorrect && (
                                  <div>
                                    <span className="font-medium">Why the selected answer is not best:</span> It does not address the highest-priority concept as well as the correct option for this item.
                                  </div>
                                )}
                              </div>
                              <div className="mt-4 flex justify-end">
                                <Button className="rounded-2xl" onClick={nextQuestion} disabled={quizIndex === quiz.length - 1}>Next Question</Button>
                              </div>
                            </div>
                          )}

                          {quizIndex === quiz.length - 1 && quizItem.userAnswer !== null && (
                            <div className="rounded-[2rem] bg-sky-50 p-5">
                              <div className="text-lg font-semibold mb-2">Quiz Summary</div>
                              <div className="grid gap-2 md:grid-cols-3 text-sm">
                                <div>Answered: <span className="font-medium">{answeredCount}</span></div>
                                <div>Correct: <span className="font-medium">{correctCount}</span></div>
                                <div>Score: <span className="font-medium">{quiz.length ? Math.round((correctCount / quiz.length) * 100) : 0}%</span></div>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {studyMode === "notes" && (
                <motion.div key="notes" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <Card className="rounded-3xl border-0 shadow-lg bg-white/90">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><NotebookPen className="h-5 w-5" /> Review Notes</CardTitle>
                      <CardDescription>Use this as a quick preview reviewer from the uploaded or pasted content.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[540px] rounded-[2rem] bg-slate-50 p-6">
                        <div className="whitespace-pre-wrap text-sm leading-7">{notesSummary}</div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-3xl border-0 shadow-lg bg-white/90">
            <CardHeader>
              <CardTitle className="text-lg">How this helps memory</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-slate-600">
              Quick flashcards, instant feedback, and weak-card filtering make it easier to remember the things she usually forgets.
            </CardContent>
          </Card>
          <Card className="rounded-3xl border-0 shadow-lg bg-white/90">
            <CardHeader>
              <CardTitle className="text-lg">Best use on low-energy days</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-slate-600">
              Start with 5 cards, then switch to a 20-question quiz only when she feels ready. The app is meant to feel easy to begin.
            </CardContent>
          </Card>
          <Card className="rounded-3xl border-0 shadow-lg bg-white/90">
            <CardHeader>
              <CardTitle className="text-lg">Reset Demo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
              <div>Reset the app to the starter nursing deck anytime.</div>
              <Button variant="outline" className="rounded-2xl" onClick={resetApp}><RotateCcw className="mr-2 h-4 w-4" /> Reset App</Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Start Quiz</DialogTitle>
            <DialogDescription>
              Choose the subject and difficulty, then generate a 20-question quiz with rationales.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-2xl bg-rose-50 p-4 text-sm font-medium">{encouragement}</div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Subject</label>
                <Select value={subject} onValueChange={(v: string) => setSubject(v)}>
                  <SelectTrigger className="rounded-2xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {subjects.map((s: string) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Difficulty</label>
                <Select value={difficulty} onValueChange={(v: string) => setDifficulty(v)}>
                  <SelectTrigger className="rounded-2xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full rounded-2xl" onClick={startQuiz}>Generate 20 Questions</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactElement;
  label: string;
  value: string | number;
}

function StatCard({ icon, label, value }: StatCardProps): React.ReactElement {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="mb-2 flex items-center gap-2 text-slate-500">{icon}<span className="text-xs uppercase tracking-wide">{label}</span></div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description: string;
}

function EmptyState({ title, description }: EmptyStateProps): React.ReactElement {
  return (
    <div className="rounded-[2rem] bg-slate-50 p-10 text-center">
      <div className="text-xl font-semibold">{title}</div>
      <div className="mt-2 text-sm text-slate-500">{description}</div>
    </div>
  );
}
