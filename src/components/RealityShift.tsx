import { useCallback, useMemo, useRef, useState } from "react";
import { QUESTIONS, CATEGORY_COLORS, type Category, type Question } from "@/data/questions";

// ============ Audio (Web Audio API — keine Asset-Dateien nötig) ============
let audioCtx: AudioContext | null = null;
function ac() {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    if (AC) audioCtx = new AC();
  }
  return audioCtx;
}
function beep(freq: number, duration = 0.15, type: OscillatorType = "sine", gain = 0.15) {
  const ctx = ac();
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g);
  g.connect(ctx.destination);
  o.start();
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  o.stop(ctx.currentTime + duration);
}
const sfx = {
  dice: () => { [400, 600, 500, 700].forEach((f, i) => setTimeout(() => beep(f, 0.08, "square", 0.1), i * 60)); },
  right: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.18, "triangle", 0.18), i * 90)); },
  wrong: () => { [220, 180, 140].forEach((f, i) => setTimeout(() => beep(f, 0.22, "sawtooth", 0.15), i * 120)); },
  win: () => { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => beep(f, 0.25, "triangle", 0.2), i * 130)); },
  move: () => beep(880, 0.05, "sine", 0.08),
};

// ============ Spielfeld-Generierung (40 Felder, snake-loop) ============
const BOARD_SIZE = 40;
const CATS: Category[] = ["Wahrheit", "Realität", "Ethik", "Erkenntnis", "Gesellschaft", "Medien", "Moral", "Freiheit"];
const ICONS: Record<Category, string> = {
  Wahrheit: "◈", Realität: "◉", Ethik: "✦", Erkenntnis: "✧",
  Gesellschaft: "❖", Medien: "◆", Moral: "✪", Freiheit: "✺",
};

interface Tile {
  index: number;
  category: Category;
  x: number; // grid col
  y: number; // grid row
}

const BOARD: Tile[] = (() => {
  // 10 cols x 4 rows snake
  const cols = 10, rows = 4;
  const tiles: Tile[] = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    const row = Math.floor(i / cols);
    const colInRow = i % cols;
    const x = row % 2 === 0 ? colInRow : cols - 1 - colInRow;
    const y = row;
    tiles.push({
      index: i,
      category: CATS[i % CATS.length],
      x,
      y,
    });
  }
  return tiles;
})();

// ============ Spieler ============
const PLAYER_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308"];
const PLAYER_NAMES = ["Spieler 1", "Spieler 2", "Spieler 3", "Spieler 4"];

interface Player {
  id: number;
  name: string;
  color: string;
  pos: number;
  score: number;
}

type Phase = "menu" | "play" | "rolling" | "moving" | "question" | "result" | "win";

interface ActiveQuestion {
  q: Question;
  shuffled: { text: string; isCorrect: boolean }[];
}

function shuffleAnswers(q: Question): ActiveQuestion {
  const arr = q.a.map((text, i) => ({ text, isCorrect: i === q.correct }));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return { q, shuffled: arr };
}

export default function RealityShift() {
  const [phase, setPhase] = useState<Phase>("menu");
  const [playerCount, setPlayerCount] = useState(2);
  const [players, setPlayers] = useState<Player[]>([]);
  const [current, setCurrent] = useState(0);
  const [dice, setDice] = useState<number | null>(null);
  const [activeQ, setActiveQ] = useState<ActiveQuestion | null>(null);
  const [result, setResult] = useState<"right" | "wrong" | null>(null);
  const [winner, setWinner] = useState<Player | null>(null);
  const [askedIdx, setAskedIdx] = useState<Set<number>>(new Set());
  const diceBtnRef = useRef<HTMLButtonElement>(null);

  const startGame = useCallback((count: number) => {
    ac(); // unlock audio on user gesture
    setPlayerCount(count);
    setPlayers(
      Array.from({ length: count }, (_, i) => ({
        id: i,
        name: PLAYER_NAMES[i],
        color: PLAYER_COLORS[i],
        pos: 0,
        score: 0,
      })),
    );
    setCurrent(0);
    setDice(null);
    setActiveQ(null);
    setResult(null);
    setWinner(null);
    setAskedIdx(new Set());
    setPhase("play");
  }, []);

  const pickQuestion = useCallback((): ActiveQuestion => {
    const available = QUESTIONS.map((_, i) => i).filter((i) => !askedIdx.has(i));
    const pool = available.length > 0 ? available : QUESTIONS.map((_, i) => i);
    const idx = pool[Math.floor(Math.random() * pool.length)];
    if (available.length > 0) {
      setAskedIdx((s) => new Set(s).add(idx));
    } else {
      setAskedIdx(new Set([idx]));
    }
    return shuffleAnswers(QUESTIONS[idx]);
  }, [askedIdx]);

  const rollDice = useCallback(() => {
    if (phase !== "play") return;
    setPhase("rolling");
    sfx.dice();
    let count = 0;
    const interval = setInterval(() => {
      setDice(1 + Math.floor(Math.random() * 6));
      count++;
      if (count > 10) {
        clearInterval(interval);
        const final = 1 + Math.floor(Math.random() * 6);
        setDice(final);
        setTimeout(() => movePlayer(final), 350);
      }
    }, 70);
  }, [phase]);

  const movePlayer = useCallback((steps: number) => {
    setPhase("moving");
    const startPos = players[current].pos;
    let stepIdx = 0;
    const advance = () => {
      stepIdx++;
      sfx.move();
      const newPos = Math.min(startPos + stepIdx, BOARD_SIZE - 1);
      setPlayers((ps) => ps.map((p, i) => (i === current ? { ...p, pos: newPos } : p)));
      if (stepIdx < steps && newPos < BOARD_SIZE - 1) {
        setTimeout(advance, 280);
      } else {
        setTimeout(() => {
          if (newPos >= BOARD_SIZE - 1) {
            sfx.win();
            setWinner({ ...players[current], pos: newPos });
            setPhase("win");
          } else {
            setActiveQ(pickQuestion());
            setPhase("question");
          }
        }, 350);
      }
    };
    setTimeout(advance, 200);
  }, [players, current, pickQuestion]);

  const answer = useCallback((isCorrect: boolean) => {
    if (phase !== "question") return;
    if (isCorrect) {
      sfx.right();
      setResult("right");
      setPlayers((ps) => ps.map((p, i) => (i === current ? { ...p, score: p.score + 1 } : p)));
    } else {
      sfx.wrong();
      setResult("wrong");
      setPlayers((ps) =>
        ps.map((p, i) => (i === current ? { ...p, pos: Math.max(0, p.pos - 1) } : p)),
      );
    }
    setPhase("result");
    setTimeout(() => {
      setResult(null);
      setActiveQ(null);
      setDice(null);
      setCurrent((c) => (c + 1) % players.length);
      setPhase("play");
    }, 1800);
  }, [phase, current, players.length]);

  const currentPlayer = players[current];

  // ===================== UI =====================
  if (phase === "menu") {
    return <MenuScreen onStart={startGame} />;
  }

  return (
    <div className="rs-root">
      <Particles />

      {/* Header */}
      <header className="rs-header">
        <h1 className="rs-title">Reality Shift</h1>
        <div className="rs-players-bar">
          {players.map((p, i) => (
            <div
              key={p.id}
              className={`rs-pchip ${i === current ? "active" : ""}`}
              style={{ ["--pc" as any]: p.color }}
            >
              <span className="rs-pdot" />
              <span>{p.name}</span>
              <span className="rs-pscore">{p.score}</span>
            </div>
          ))}
        </div>
      </header>

      {/* Board */}
      <main className="rs-board-wrap">
        <div className="rs-board" style={{ ["--cols" as any]: 10, ["--rows" as any]: 4 }}>
          {BOARD.map((t) => {
            const color = CATEGORY_COLORS[t.category];
            const isGoal = t.index === BOARD_SIZE - 1;
            const isStart = t.index === 0;
            return (
              <div
                key={t.index}
                className={`rs-tile ${isGoal ? "goal" : ""} ${isStart ? "start" : ""}`}
                style={{
                  gridColumnStart: t.x + 1,
                  gridRowStart: t.y + 1,
                  ["--tc" as any]: color,
                }}
                title={t.category}
              >
                <span className="rs-tile-icon">{isGoal ? "★" : isStart ? "▶" : ICONS[t.category]}</span>
                <span className="rs-tile-num">{t.index + 1}</span>
              </div>
            );
          })}

          {/* Avatars on board */}
          {players.map((p, i) => {
            const t = BOARD[p.pos];
            const offsetX = (i % 2) * 18 - 9;
            const offsetY = Math.floor(i / 2) * 18 - 9;
            return (
              <div
                key={p.id}
                className="rs-avatar"
                style={{
                  gridColumnStart: t.x + 1,
                  gridRowStart: t.y + 1,
                  ["--ac" as any]: p.color,
                  transform: `translate(${offsetX}px, ${offsetY}px)`,
                }}
              >
                {i + 1}
              </div>
            );
          })}
        </div>
      </main>

      {/* Footer / dice */}
      <footer className="rs-footer">
        <div className="rs-turn">
          <span className="rs-turn-label">Am Zug:</span>
          <span className="rs-turn-name" style={{ color: currentPlayer?.color }}>
            {currentPlayer?.name}
          </span>
        </div>
        <button
          ref={diceBtnRef}
          className="rs-dice"
          onClick={rollDice}
          disabled={phase !== "play"}
          aria-label="Würfeln"
        >
          <span className={`rs-dice-face ${phase === "rolling" ? "spin" : ""}`}>
            {dice ?? "?"}
          </span>
          <span className="rs-dice-label">{phase === "rolling" ? "Würfle..." : "Würfeln"}</span>
        </button>
        <div className="rs-hint">{phaseHint(phase)}</div>
      </footer>

      {/* Question overlay */}
      {phase === "question" && activeQ && (
        <QuestionOverlay
          q={activeQ}
          playerColor={currentPlayer.color}
          onAnswer={answer}
        />
      )}

      {/* Result overlay */}
      {phase === "result" && result && <ResultOverlay kind={result} />}

      {/* Win overlay */}
      {phase === "win" && winner && (
        <WinOverlay winner={winner} onRestart={() => setPhase("menu")} />
      )}
    </div>
  );
}

function phaseHint(p: Phase) {
  switch (p) {
    case "play": return "Tippe auf den Würfel";
    case "rolling": return "Würfel rollt...";
    case "moving": return "Figur bewegt sich...";
    case "question": return "Beantworte die Frage";
    case "result": return "Ergebnis...";
    default: return "";
  }
}

// ===================== Sub-Komponenten =====================

function MenuScreen({ onStart }: { onStart: (n: number) => void }) {
  return (
    <div className="rs-menu">
      <Particles />
      <div className="rs-menu-inner">
        <div className="rs-menu-eyebrow">Philosophisches Multiplayer-Brettspiel</div>
        <h1 className="rs-menu-title">
          <span className="rs-glow-text">Reality</span>{" "}
          <span className="rs-glow-text alt">Shift</span>
        </h1>
        <p className="rs-menu-sub">
          Wahrheit. Realität. Erkenntnis. — Würfle, ziehe, denke.
        </p>

        <div className="rs-menu-card">
          <div className="rs-menu-card-title">Wie viele Spieler?</div>
          <div className="rs-menu-grid">
            {[2, 3, 4].map((n) => (
              <button key={n} className="rs-menu-btn" onClick={() => onStart(n)}>
                <div className="rs-menu-btn-n">{n}</div>
                <div className="rs-menu-btn-l">Spieler</div>
                <div className="rs-menu-btn-dots">
                  {Array.from({ length: n }).map((_, i) => (
                    <span key={i} style={{ background: PLAYER_COLORS[i] }} />
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rs-menu-tags">
          {CATS.map((c) => (
            <span key={c} className="rs-menu-tag" style={{ ["--tc" as any]: CATEGORY_COLORS[c] }}>
              {ICONS[c]} {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function QuestionOverlay({
  q,
  playerColor,
  onAnswer,
}: {
  q: ActiveQuestion;
  playerColor: string;
  onAnswer: (correct: boolean) => void;
}) {
  const color = CATEGORY_COLORS[q.q.category];
  return (
    <div className="rs-overlay">
      <div className="rs-qcard" style={{ ["--qc" as any]: color, ["--pc" as any]: playerColor }}>
        <div className="rs-qcat">
          <span className="rs-qcat-icon">{ICONS[q.q.category]}</span>
          {q.q.category}
        </div>
        <h2 className="rs-qtext">{q.q.q}</h2>
        <div className="rs-qanswers">
          {q.shuffled.map((a, i) => (
            <button
              key={i}
              className="rs-qans"
              onClick={() => onAnswer(a.isCorrect)}
            >
              <span className="rs-qans-i">{String.fromCharCode(65 + i)}</span>
              <span className="rs-qans-t">{a.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ResultOverlay({ kind }: { kind: "right" | "wrong" }) {
  return (
    <div className={`rs-overlay rs-result ${kind}`}>
      <div className="rs-result-card">
        <div className="rs-result-icon">{kind === "right" ? "✓" : "✕"}</div>
        <div className="rs-result-text">
          {kind === "right" ? "Erkenntnis gewonnen" : "Illusion statt Wahrheit"}
        </div>
        <div className="rs-result-sub">
          {kind === "right" ? "Du bleibst auf deinem Feld." : "Ein Feld zurück."}
        </div>
      </div>
    </div>
  );
}

function WinOverlay({ winner, onRestart }: { winner: Player; onRestart: () => void }) {
  return (
    <div className="rs-overlay rs-win">
      <Confetti />
      <div className="rs-win-card" style={{ ["--wc" as any]: winner.color }}>
        <div className="rs-win-eyebrow">Sieg</div>
        <h2 className="rs-win-title">{winner.name} hat gewonnen!</h2>
        <p className="rs-win-sub">{winner.score} richtige Antworten · Realität verschoben.</p>
        <button className="rs-win-btn" onClick={onRestart}>Neues Spiel</button>
      </div>
    </div>
  );
}

function Particles() {
  const dots = useMemo(
    () =>
      Array.from({ length: 28 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 2 + Math.random() * 6,
        delay: Math.random() * 8,
        dur: 10 + Math.random() * 14,
        hue: Math.floor(Math.random() * 360),
      })),
    [],
  );
  return (
    <div className="rs-particles" aria-hidden>
      {dots.map((d) => (
        <span
          key={d.id}
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size,
            animationDelay: `${d.delay}s`,
            animationDuration: `${d.dur}s`,
            background: `hsla(${d.hue}, 90%, 65%, 0.7)`,
            boxShadow: `0 0 ${d.size * 3}px hsla(${d.hue}, 90%, 65%, 0.8)`,
          }}
        />
      ))}
    </div>
  );
}

function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 60 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        dur: 1.6 + Math.random() * 1.6,
        hue: Math.floor(Math.random() * 360),
        rot: Math.floor(Math.random() * 360),
      })),
    [],
  );
  return (
    <div className="rs-confetti" aria-hidden>
      {bits.map((b) => (
        <span
          key={b.id}
          style={{
            left: `${b.left}%`,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.dur}s`,
            background: `hsl(${b.hue}, 90%, 60%)`,
            transform: `rotate(${b.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}
