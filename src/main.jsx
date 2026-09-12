import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion } from 'framer-motion';
import { courseModules, finalQuestions } from './course-data';
import logoUrl from '../assets/logo-ciberseguridad.png';
import './styles.css';
import './overrides.css';

const PASS_SCORE = 140;
const MODULE_MAX_SCORE = 200;
const FINAL_UNLOCK_SCORE = 840;
const STORAGE_USERS = 'cq_react_users';
const STORAGE_SESSION = 'cq_react_session';

function getUsers() {
  const saved = JSON.parse(localStorage.getItem(STORAGE_USERS) || '[]');
  const admin = { id: 'cq-admin', name: 'Administrador', email: 'admin@cyberquest.com', password: 'admin123', role: 'admin' };
  const otherUsers = saved.filter((user) => user.email !== admin.email);
  return [admin, ...otherUsers];
}

function getSession() {
  try { return JSON.parse(localStorage.getItem(STORAGE_SESSION) || 'null'); } catch { return null; }
}

function saveSession(user) {
  localStorage.setItem(STORAGE_SESSION, JSON.stringify(user));
}

function App() {
  const [user, setUser] = useState(getSession);
  const [screen, setScreen] = useState('auth');
  const [authMode, setAuthMode] = useState('login');
  const [notice, setNotice] = useState('');
  const [scores, setScores] = useState({});
  const [selectedModule, setSelectedModule] = useState(null);

  const isAdmin = user?.role === 'admin';
  const totalScore = isAdmin ? 1200 : Object.values(scores).reduce((sum, score) => sum + score, 0);
  const approvedModules = isAdmin
    ? courseModules.map((module) => module.id)
    : courseModules.filter((module) => (scores[module.id] || 0) >= PASS_SCORE).map((module) => module.id);
  const finalUnlocked = isAdmin || (approvedModules.length === courseModules.length && totalScore >= FINAL_UNLOCK_SCORE);

  useEffect(() => {
    if (user) setScreen('welcome');
  }, [user]);

  function authenticate(formData) {
    const email = formData.email.trim().toLowerCase();
    const password = formData.password;
    const users = getUsers();

    if (authMode === 'register') {
      if (!formData.name.trim()) return setNotice('Ingresá tu nombre para personalizar tu recorrido.');
      if (users.some((item) => item.email === email)) return setNotice('Ese correo ya está registrado. Probá iniciar sesión.');
      const newUser = { id: crypto.randomUUID(), name: formData.name.trim(), email, password, role: 'user' };
      localStorage.setItem(STORAGE_USERS, JSON.stringify([...users.filter((item) => item.role !== 'admin'), newUser]));
      saveSession(newUser);
      setUser(newUser);
      return;
    }

    const foundUser = users.find((item) => item.email === email && item.password === password);
    if (!foundUser) return setNotice('Correo o contraseña incorrectos.');
    saveSession(foundUser);
    setUser(foundUser);
  }

  function logout() {
    localStorage.removeItem(STORAGE_SESSION);
    setUser(null);
    setScreen('auth');
    setNotice('Sesión cerrada correctamente.');
  }

  function openModule(module) {
    setSelectedModule(module);
    setScreen('course');
  }

  function finishModule(moduleId, score) {
    setScores((previous) => ({ ...previous, [moduleId]: score }));
    setSelectedModule(null);
    setScreen('modules');
  }

  if (!user) {
    return <AuthScreen mode={authMode} notice={notice} onModeChange={(mode) => { setAuthMode(mode); setNotice(''); }} onSubmit={authenticate} />;
  }

  return (
    <main className="cq-app-shell">
      <Header user={user} totalScore={totalScore} approved={approvedModules.length} onHome={() => setScreen('welcome')} onModules={() => setScreen('modules')} onLogout={logout} />
      <AnimatePresence mode="wait">
        {screen === 'welcome' && <Welcome key="welcome" user={user} onStart={() => setScreen('modules')} />}
        {screen === 'modules' && <MissionBoard key="modules" approved={approvedModules} scores={scores} isAdmin={isAdmin} totalScore={totalScore} finalUnlocked={finalUnlocked} onOpen={openModule} onFinal={() => setScreen('final')} />}
        {screen === 'course' && selectedModule && <CourseFlow key={selectedModule.id} module={selectedModule} isAdmin={isAdmin} onClose={() => setScreen('modules')} onFinish={finishModule} />}
        {screen === 'final' && <FinalChallenge key="final" onClose={() => setScreen('modules')} />}
      </AnimatePresence>
    </main>
  );
}

function AuthScreen({ mode, notice, onModeChange, onSubmit }) {
  const isRegister = mode === 'register';
  function handleSubmit(event) {
    event.preventDefault();
    onSubmit(Object.fromEntries(new FormData(event.currentTarget)));
  }
  return (
    <main className="cq-auth-page">
      <FloatingParticles />
      <motion.section className="cq-auth-card" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}>
    <Brand />
    <p className="cq-kicker">ACCESO SEGURO</p>
    <h1>{isRegister ? 'Creá tu cuenta' : 'Ingresá a tu recorrido'}</h1>
    <p>{isRegister ? 'Completá tus datos para empezar a aprender con desafíos.' : 'Entrená con situaciones reales y protegé lo que importa.'}</p>
    {notice && <p className="cq-notice">{notice}</p>}
    <form onSubmit={handleSubmit} className="cq-auth-form">
      {isRegister && <label>Nombre y apellido<input name="name" autoComplete="name" placeholder="Ej. Mariano" required /></label>}
      <label>Correo electrónico<input name="email" type="email" autoComplete="username" placeholder="nombre@ejemplo.com" required /></label>
      <label>Contraseña<input name="password" type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} minLength="8" placeholder="Mínimo 8 caracteres" required /></label>
      <button className="cq-primary" type="submit">{isRegister ? 'Crear cuenta y comenzar' : 'Ingresar al desafío'} <span>→</span></button>
    </form>
    <p className="cq-auth-switch">{isRegister ? '¿Ya tenés cuenta?' : '¿No tenés cuenta?'} <button onClick={() => onModeChange(isRegister ? 'login' : 'register')}>{isRegister ? 'Iniciá sesión' : 'Registrate'}</button></p>
      </motion.section>
    </main>
  );
}

function Header({ user, totalScore, approved, onHome, onModules, onLogout }) {
  const progress = Math.round((approved / courseModules.length) * 100);
  return <header className="cq-header"><button className="cq-brand-button" onClick={onHome} aria-label="Ir al inicio"><Brand /></button><div className="cq-header-actions"><button className="cq-progress" onClick={onModules}><span>Tu avance</span><i><b style={{ width: `${progress}%` }} /></i><strong>{progress}%</strong></button><span className="cq-points">🛡️ {totalScore} pts</span><button className="cq-logout" onClick={onLogout}>↪ Cerrar sesión</button></div></header>;
}

function Brand() { return <span className="cq-brand"><img className="cq-brand-logo" src={logoUrl} alt="" /><strong>Cyber<span>Quest</span></strong></span>; }

function Welcome({ user, onStart }) {
  return <motion.section className="cq-welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><FloatingParticles />
    <div className="cq-welcome-copy"><p className="cq-greeting">¡Bienvenido, {user.name}!</p><p className="cq-kicker">ACADEMIA DIGITAL · EMPRESAS SEGURAS</p><h1>La seguridad se construye en cada decisión.</h1><p className="cq-lead">CyberQuest es una plataforma de capacitación interactiva para reconocer riesgos, proteger información sensible y actuar con seguridad en el trabajo y en la vida diaria.</p><p className="cq-summary"><b>Tu recorrido incluye 6 módulos:</b> contraseñas, correo personal / corporativo, protección de datos, amenazas cibernéticas, ingeniería social y grooming. En cada uno vas a encontrar contenido guiado, mini desafíos, situaciones reales y trivias.</p><button className="cq-primary" onClick={onStart}>Comenzar desafío <span>→</span></button></div>
    <IntroCarousel />
  </motion.section>;
}

function IntroCarousel() {
  const slides = [{ icon: '🎯', label: 'APLICÁ LO APRENDIDO', title: 'Situaciones reales', text: 'Decisiones cotidianas, personales o laborales.' }, { icon: '🧩', label: 'PASO A PASO', title: 'Aprendizaje activo', text: 'Practicá cada idea antes de seguir.' }, { icon: '🛡️', label: 'HÁBITOS QUE CUIDAN', title: 'Personas y equipos más seguros', text: 'Hábitos simples que previenen engaños.' }];
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  return <aside className={`cq-intro-carousel slide-${index}`}><AnimatePresence mode="wait"><motion.article className="cq-slide-card" key={slide.title} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}><div className="cq-slide-icon">{slide.icon}</div><p>{slide.label}</p><h2>{slide.title}</h2><span>{slide.text}</span><i aria-hidden="true">✦</i></motion.article></AnimatePresence><div className="cq-carousel-controls"><button aria-label="Tarjeta anterior" onClick={() => setIndex((index + slides.length - 1) % slides.length)}>←</button><span>{slides.map((_, item) => <i key={item} className={item === index ? 'active' : ''} />)}</span><button aria-label="Tarjeta siguiente" onClick={() => setIndex((index + 1) % slides.length)}>→</button></div></aside>;
}

function MissionBoard({ approved, scores, isAdmin, totalScore, finalUnlocked, onOpen, onFinal }) {
  return <motion.section className="cq-board" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><FloatingParticles />
    <section className="cq-board-intro"><div><p className="cq-kicker">RECORRIDO FORMATIVO</p><h1>Mis misiones</h1><p>Una pausa, una verificación y una buena decisión pueden cambiar el resultado.</p></div><SecurityOrb /></section>
    <section className="cq-mission-grid">{courseModules.map((module, index) => {
      const unlocked = isAdmin || index === 0 || approved.includes(courseModules[index - 1]?.id);
      const complete = isAdmin || approved.includes(module.id);
      return <motion.article key={module.id} className={`cq-mission-card ${unlocked ? 'is-unlocked' : 'is-locked'} ${complete ? 'is-complete' : ''}`} whileHover={unlocked ? { y: -7, scale: 1.01 } : {}}><span className="cq-mission-icon">{module.icon}</span><p>{complete ? 'MISIÓN SUPERADA' : unlocked ? 'MISIÓN DISPONIBLE' : 'MISIÓN BLOQUEADA'}</p><h2>{module.title}</h2><span>{module.subtitle}</span><div className="cq-card-footer"><b>{complete ? '🔓 Desbloqueada' : unlocked ? 'Abrir misión →' : '🔒 Bloqueada'}</b>{complete && <em>{isAdmin ? MODULE_MAX_SCORE : scores[module.id]} / {MODULE_MAX_SCORE} pts</em>}</div>{unlocked && <button onClick={() => onOpen(module)}>{complete ? 'Repasar →' : 'Comenzar →'}</button>}</motion.article>;
    })}</section>
    <section className={`cq-final-card ${finalUnlocked ? 'is-final-unlocked' : ''}`}><div><p>EVALUACIÓN INTEGRAL</p><h2>Desafío final</h2><span>Combiná los seis temas para conquistar el desafío CyberQuest.</span><small>Necesitás al menos {FINAL_UNLOCK_SCORE} pts y las 6 misiones aprobadas.</small></div><button disabled={!finalUnlocked} onClick={onFinal}>{finalUnlocked ? 'Comenzar evaluación →' : '🔒 Bloqueado'}</button></section>
  </motion.section>;
}

function SecurityOrb() { return <div className="cq-security-orb" title="La seguridad comienza con una pausa"><i /><i /><i /><b>◉</b><span>SEGURO</span></div>; }
function FloatingParticles() { return <div className="cq-particles" aria-hidden="true">{Array.from({ length: 26 }, (_, index) => <i key={index} />)}</div>; }

function CourseFlow({ module, isAdmin, onClose, onFinish }) {
  const [step, setStep] = useState(0);
  const [score, setScore] = useState(0);
  const [highestStep, setHighestStep] = useState(0);
  const labels = ['1. Aprendé', '2. Decidí', '3. Aprendé', '4. Decidí', '5. Trivia', '6. Aprendé', '7. Trivia'];
  const advance = (next) => { setHighestStep((current) => Math.max(current, next)); setStep(next); };
  const addPoint = () => setScore((current) => current + 20);
  const current = step === 0 ? <LearnBlock module={module} phase={0} onCorrect={addPoint} onNext={() => advance(1)} />
    : step === 1 ? <ScenarioBlock module={module} scenario={module.scenarios[0]} onCorrect={addPoint} onNext={() => advance(2)} />
      : step === 2 ? <LearnBlock module={module} phase={1} onCorrect={addPoint} onNext={() => advance(3)} />
        : step === 3 ? <ScenarioBlock module={module} scenario={module.scenarios[1]} onCorrect={addPoint} onNext={() => advance(4)} />
          : step === 4 ? <QuizBlock questions={module.quizzes.slice(0, 3)} title="Trivia" onCorrect={addPoint} onNext={() => advance(5)} />
            : step === 5 ? <LearnBlock module={module} phase={2} onCorrect={addPoint} onNext={() => advance(6)} />
              : <QuizBlock questions={module.quizzes.slice(3)} title="Trivia final" onCorrect={addPoint} onNext={() => onFinish(module.id, score)} />;
  return <motion.section className="cq-course" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}><button className="cq-back" onClick={onClose}>← Mis misiones</button><header className="cq-course-header"><span>{module.icon}</span><div><h1>{module.title}</h1><p>{module.subtitle}</p></div><b>{score} / {MODULE_MAX_SCORE} pts</b></header><nav className="cq-stepper">{labels.map((label, index) => <button key={label} className={index === step ? 'active' : ''} disabled={!isAdmin && index > highestStep} onClick={() => setStep(index)}>{label}</button>)}</nav><AnimatePresence mode="wait"><motion.div key={step} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }}>{current}</motion.div></AnimatePresence></motion.section>;
}

function LearnBlock({ module, phase, onCorrect, onNext }) {
  const [answered, setAnswered] = useState(false);
  const mini = module.minis[phase];
  const details = phase === 0 ? [module.learn.details[0]] : phase === 1 ? [module.learn.details[1]] : module.learn.details.slice(2);
  const pointGroups = [[0], [1, 2], [3]];
  return <article className="cq-activity"><p className="cq-kicker">CONTENIDO EDUCATIVO · BLOQUE {phase + 1} DE 3</p><h2>{phase === 0 ? module.learn.title : phase === 1 ? 'Profundizá el concepto' : 'Llevá el conocimiento a la práctica'}</h2>{phase === 0 && <p className="cq-activity-lead">{module.learn.intro}</p>}{details.map((detail) => <p className="cq-detail" key={detail}>{detail}</p>)}<div className="cq-learning-points">{pointGroups[phase].map((index) => module.learn.points[index]).filter(Boolean).map(([title, text]) => <div key={title}><b>{title}</b><span>{text}</span></div>)}</div><QuestionCard eyebrow="MINI DESAFÍO · 20 PTS" item={mini} onCorrect={onCorrect} onAnswered={() => setAnswered(true)} />{answered && <button className="cq-primary" onClick={onNext}>{phase === 0 ? 'Ir a la situación →' : phase === 1 ? 'Ver la próxima situación →' : 'Ir a la trivia final →'}</button>}</article>;
}

function ScenarioBlock({ scenario, onCorrect, onNext }) {
  const [answered, setAnswered] = useState(false);
  const chatMatch = scenario.text.match(/^(.*?te escribe(?: por chat)?):\s*[“"](.+?)[”"]$/);
  const isChat = Boolean(scenario.person && chatMatch);
  const context = chatMatch?.[1] || '';
  const message = chatMatch?.[2] || scenario.text;
  const [messageVisible, setMessageVisible] = useState(!isChat);
  useEffect(() => {
    setMessageVisible(!isChat);
    if (!isChat) return undefined;
    const timer = window.setTimeout(() => setMessageVisible(true), 1450);
    return () => window.clearTimeout(timer);
  }, [scenario, isChat]);
  const picture = scenario.visual?.includes('/') ? <img src={scenario.visual} alt={scenario.person || 'Persona de la situación'} /> : <span className={`cq-scenario-emoji ${scenario.visual === '☎️' ? 'is-phone' : ''}`}>{scenario.visual}</span>;
  const avatarClass = `cq-person-avatar ${scenario.visual?.includes('/') ? '' : 'has-emoji'}`;
  const chat = isChat ? <><p className="cq-chat-context">{context}:</p><section className="cq-chat-window"><header><div className={avatarClass}>{picture}</div><div><b>{scenario.person.split(' · ')[0]}</b><small>● En línea</small></div><span>•••</span></header><div className="cq-chat-thread"><time>Ahora</time>{messageVisible ? <motion.p className="cq-chat-message" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>{message}<small>✓✓</small></motion.p> : <div className="cq-typing"><i /><i /><i /></div>}</div></section></> : <section className="cq-dialogue-scene"><div className={avatarClass}>{picture}</div><div className="cq-chat-content"><span>{scenario.person || 'Situación para analizar'}</span><p>{scenario.text}</p></div></section>;
  return <article className="cq-activity"><p className="cq-kicker">SITUACIÓN COTIDIANA · 20 PTS</p><h2>{scenario.title}</h2>{chat}{messageVisible && <QuestionCard item={{ prompt: '¿Qué harías en este caso?', options: scenario.options, answer: scenario.answer, feedback: scenario.feedback }} onCorrect={onCorrect} onAnswered={() => setAnswered(true)} />}{answered && <button className="cq-primary" onClick={onNext}>Continuar →</button>}</article>;
}

function QuizBlock({ questions, title, onCorrect, onNext }) {
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const last = index === questions.length - 1;
  function next() { if (last) onNext(); else { setIndex((current) => current + 1); setAnswered(false); } }
  return <article className="cq-activity"><p className="cq-kicker">{title.toUpperCase()} · PREGUNTA {index + 1} DE {questions.length} · 20 PTS</p><QuestionCard key={questions[index].prompt} item={questions[index]} onCorrect={onCorrect} onAnswered={() => setAnswered(true)} />{answered && <button className="cq-primary" onClick={next}>{last ? 'Ver resultado del módulo →' : 'Siguiente pregunta →'}</button>}</article>;
}

function QuestionCard({ eyebrow, item, onCorrect, onAnswered }) {
  const [answer, setAnswer] = useState(null);
  const complete = answer !== null;
  function choose(index) { if (complete) return; setAnswer(index); if (index === item.answer) onCorrect(); onAnswered(); }
  return <section className="cq-question-card">{eyebrow && <p className="cq-kicker">{eyebrow}</p>}<h3>{item.prompt}</h3><div className="cq-options">{item.options.map((option, index) => <button key={option} disabled={complete} className={complete ? index === item.answer ? 'correct' : index === answer ? 'wrong' : '' : ''} onClick={() => choose(index)}><b>{String.fromCharCode(65 + index)}.</b> {option}</button>)}</div>{complete && <p className={`cq-feedback ${answer === item.answer ? 'good' : 'bad'}`}><b>{answer === item.answer ? '¡Muy bien! ' : 'Para recordar: '}</b>{item.feedback}</p>}</section>;
}

function FinalChallenge({ onClose }) {
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [finished, setFinished] = useState(false);
  const item = finalQuestions[index];
  function next() { if (index === finalQuestions.length - 1) setFinished(true); else { setIndex((current) => current + 1); setAnswered(false); } }
  if (finished) return <section className="cq-course"><button className="cq-back" onClick={onClose}>← Mis misiones</button><article className="cq-activity cq-result"><span>🏆</span><p className="cq-kicker">RESULTADO INTEGRAL</p><h1>{correct} de {finalQuestions.length} respuestas correctas</h1><p>{correct >= 8 ? 'Excelente desempeño: aplicaste prácticas seguras en la mayoría de las situaciones.' : 'Repasá los módulos que te resultaron más difíciles. Cada intento fortalece tus decisiones cotidianas.'}</p><button className="cq-primary" onClick={onClose}>Volver a mis módulos →</button></article></section>;
  return <section className="cq-course"><button className="cq-back" onClick={onClose}>← Mis misiones</button><header className="cq-course-header"><span>🏆</span><div><h1>Desafío final</h1><p>Una evaluación integral de los seis módulos.</p></div></header><article className="cq-activity"><p className="cq-kicker">EVALUACIÓN INTEGRAL · {index + 1} DE {finalQuestions.length}</p><QuestionCard key={item.prompt} item={item} onCorrect={() => setCorrect((value) => value + 1)} onAnswered={() => setAnswered(true)} />{answered && <button className="cq-primary" onClick={next}>{index === finalQuestions.length - 1 ? 'Ver resultado final →' : 'Siguiente desafío →'}</button>}</article></section>;
}

createRoot(document.getElementById('root')).render(<App />);
