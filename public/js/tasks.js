/*
  Writing and speaking tasks. Shared by the pages (window.AnswerTasks) and the AI server function (require).
  keyPoints: what a complete answer covers. Each point is found if ANY of its cues appears (word endings ignored).
  The server only ever scores these tasks, so the AI endpoint can't be used as a general chatbot.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AnswerTasks = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const GOOD_LISTENER = 'A good listener looks at the speaker and waits for their turn to talk. They ask questions when they do not understand. Listening carefully helps us speak with confidence.';

  const WRITE = [
    { id: 'w-leave-email', mode: 'write', format: 'email', title: 'Email: asking for leave',
      prompt: 'Write an email to your manager asking for one day’s leave next Friday. Say why you need it and how your work will be covered.',
      minWords: 60, maxWords: 110, formal: true,
      keyPoints: [
        { label: 'asks for leave', cues: ['leave', 'day off', 'holiday', 'absent', 'off on'] },
        { label: 'gives the day', cues: ['friday'] },
        { label: 'gives a reason', cues: ['because', 'as i', 'since', 'due to', 'wedding', 'marriage', 'function', 'appointment', 'sick', 'family'] },
        { label: 'plans the work', cues: ['complete', 'finish', 'cover', 'handle', 'take care', 'colleague', 'before thursday', 'on thursday', 'pending'] },
      ],
      model: 'Subject: Leave request for Friday\n\nDear Mr Sharma,\n\nI would like to request one day’s leave next Friday, as I am attending my cousin’s wedding in Lucknow. I will finish my pending reports by Thursday evening, and Rahul has agreed to handle my calls and emails while I am away. I will be back in the office on Monday.\n\nPlease let me know if this is all right.\n\nThank you,\nPriya' },
    { id: 'w-summary-listener', mode: 'write', format: 'summary', title: 'Summary: A Good Listener',
      prompt: 'Read the passage and summarise it in your own words in 2 or 3 sentences.',
      passage: GOOD_LISTENER, minWords: 25, maxWords: 60,
      keyPoints: [
        { label: 'looks at the speaker', cues: ['look', 'eye', 'attention', 'face'] },
        { label: 'waits their turn', cues: ['wait', 'turn', 'interrupt', 'let them finish'] },
        { label: 'asks questions', cues: ['question', 'ask'] },
        { label: 'listening builds confidence', cues: ['confiden', 'speak better', 'speak well'] },
      ],
      model: 'Good listeners pay attention to the person speaking and do not interrupt. When something is unclear, they ask about it. Listening well also makes us more confident when we speak.' },
    { id: 'w-opinion-phones', mode: 'write', format: 'opinion', title: 'Opinion: phones in class',
      prompt: 'Should students be allowed to use mobile phones in class? Give your opinion and at least two reasons.',
      minWords: 60, maxWords: 100,
      keyPoints: [
        { label: 'gives an opinion', cues: ['i think', 'i believe', 'in my opinion', 'i feel', 'should', 'agree', 'disagree'] },
        { label: 'first reason', cues: ['because', 'since', 'firstly', 'first', 'one reason'] },
        { label: 'second reason', cues: ['also', 'secondly', 'second', 'another', 'moreover', 'besides'] },
        { label: 'an example', cues: ['for example', 'for instance', 'such as', 'like when'] },
      ],
      model: 'In my opinion, students should be allowed to use phones in class, but only for learning. First, phones give quick access to dictionaries and videos that explain hard topics. Second, many useful apps help students practise English and maths. For example, a student can look up a new word in seconds. However, teachers should set clear rules so that phones are not used for games or chatting.' },
    { id: 'w-reply-customer', mode: 'write', format: 'reply', title: 'Reply: a customer complaint',
      prompt: 'A customer writes: “My order arrived late and the box was damaged.” Write a polite reply.',
      minWords: 50, maxWords: 90, formal: true,
      keyPoints: [
        { label: 'says sorry', cues: ['sorry', 'apologi', 'regret'] },
        { label: 'mentions the problem', cues: ['late', 'delay', 'damage', 'box'] },
        { label: 'offers a fix', cues: ['replace', 'refund', 'return', 'send', 'new', 'discount', 'exchange'] },
        { label: 'polite close', cues: ['thank', 'regards', 'sincerely', 'happy to help'] },
      ],
      model: 'Dear Customer,\n\nThank you for letting us know, and we are very sorry that your order arrived late and the box was damaged. We will send you a replacement free of charge within two days. If you prefer, we can give you a full refund instead. Please reply to this email with your choice.\n\nKind regards,\nCustomer Care Team' },
  ];

  const SPEAK = [
    { id: 's-intro-job', mode: 'speak', format: 'intro', title: 'Introduce yourself for a job',
      prompt: 'Introduce yourself for a job interview at a shop. Say who you are, what you have studied or done, your strengths, and why you want this job.',
      minSec: 60, maxSec: 90,
      keyPoints: [
        { label: 'your name', cues: ['my name', 'i am', "i'm", 'myself'] },
        { label: 'where you are from', cues: ['from', 'live in', 'living in'] },
        { label: 'studies or work', cues: ['study', 'studied', 'completed', 'degree', 'college', 'school', 'course', 'worked', 'working', 'experience'] },
        { label: 'your strengths', cues: ['strength', 'good at', 'hard working', 'hardworking', 'honest', 'friendly', 'skill', 'quick learner'] },
        { label: 'why this job', cues: ['want to', 'would like', 'interested', 'join', 'because', 'customer'] },
      ],
      model: 'Good morning. My name is Arjun Kumar, and I am from Lucknow. I completed my B.Com last year, and I am now doing a course in retail management. My strengths are that I am hard-working and I enjoy talking to people. I would like to join your shop because I want to help customers find what they need, and I learn quickly on the job. Thank you.' },
    { id: 's-weekend', mode: 'speak', format: 'answer', title: 'Talk about your weekend',
      prompt: 'What did you do last weekend? Talk about where you went, who you were with and how you felt.',
      minSec: 45, maxSec: 60, pastTense: true,
      keyPoints: [
        { label: 'when', cues: ['saturday', 'sunday', 'weekend'] },
        { label: 'what you did', cues: ['went', 'visited', 'played', 'watched', 'met', 'cooked', 'helped', 'stayed', 'read'] },
        { label: 'who you were with', cues: ['with', 'family', 'friend', 'brother', 'sister', 'mother', 'father', 'cousin'] },
        { label: 'how you felt', cues: ['enjoyed', 'happy', 'fun', 'tired', 'liked', 'relaxed', 'great', 'nice', 'boring'] },
      ],
      model: 'Last weekend I visited my grandparents with my family. On Saturday we cooked lunch together, and in the evening I played cricket with my cousins. On Sunday we went to the market and bought fresh fruit. I felt very happy because I had not seen them for a long time.' },
    { id: 's-goal', mode: 'speak', format: 'answer', title: 'Your goal for next year',
      prompt: 'What is one goal you have for next year, and how will you reach it?',
      minSec: 45, maxSec: 75,
      keyPoints: [
        { label: 'the goal', cues: ['goal', 'want to', 'plan to', 'would like', 'hope to', 'aim'] },
        { label: 'how you will reach it', cues: ['will', 'by ', 'practise', 'practice', 'study', 'every day', 'every week', 'join', 'save'] },
        { label: 'why it matters', cues: ['because', 'so that', 'help me', 'important'] },
      ],
      model: 'Next year my goal is to speak English confidently at work. I will practise for twenty minutes every day by reading aloud and talking with my friends in English. I will also join a weekend speaking club. This is important to me because I want to get a better job in customer service.' },
  ];

  const ALL = [...WRITE, ...SPEAK];
  return { WRITE, SPEAK, ALL, byId: id => ALL.find(t => t.id === id) || null };
});
