const API_BASE = "https://equran.id/api/v2";

const elements = {
  tabs: document.querySelectorAll(".nav-tab"),
  views: {
    quran: document.querySelector("#quranView"),
    mentor: document.querySelector("#mentorView")
  },
  surahList: document.querySelector("#surahList"),
  surahListStatus: document.querySelector("#surahListStatus"),
  surahCount: document.querySelector("#surahCount"),
  surahSearch: document.querySelector("#surahSearch"),
  readingStatus: document.querySelector("#readingStatus"),
  surahContent: document.querySelector("#surahContent"),
  readingTitle: document.querySelector("#readingTitle"),
  surahMeta: document.querySelector("#surahMeta"),
  surahArabicName: document.querySelector("#surahArabicName"),
  surahAudioPanel: document.querySelector("#surahAudioPanel"),
  reciterSelect: document.querySelector("#reciterSelect"),
  surahAudio: document.querySelector("#surahAudio"),
  audioStatus: document.querySelector("#audioStatus"),
  verseList: document.querySelector("#verseList"),
  activeSurahName: document.querySelector("#activeSurahName"),
  scoreValue: document.querySelector("#scoreValue"),
  modeButtons: document.querySelectorAll(".mode-button"),
  quizMessage: document.querySelector("#quizMessage"),
  questionArea: document.querySelector("#questionArea"),
  questionNumber: document.querySelector("#questionNumber"),
  questionText: document.querySelector("#questionText"),
  answerPrompt: document.querySelector("#answerPrompt"),
  answerOptions: document.querySelector("#answerOptions"),
  answerFeedback: document.querySelector("#answerFeedback"),
  nextQuestion: document.querySelector("#nextQuestion"),
  restartQuiz: document.querySelector("#restartQuiz"),
  chooseSurah: document.querySelector("#chooseSurah")
};

const state = {
  surahs: [],
  selectedSurah: null,
  verses: [],
  mode: "guess",
  score: 0,
  currentQuestion: null,
  answered: false,
  detailRequest: 0
};

async function fetchApi(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`Server mengirim status ${response.status}.`);
  }

  const result = await response.json();
  if (!result || !Object.hasOwn(result, "data")) {
    throw new Error("Struktur data dari API tidak sesuai.");
  }

  return result.data;
}

function setActiveView(viewName) {
  for (const tab of elements.tabs) {
    const isActive = tab.dataset.view === viewName;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
  }

  for (const [name, view] of Object.entries(elements.views)) {
    view.hidden = name !== viewName;
  }

  if (viewName === "mentor" && state.selectedSurah && state.verses.length > 0 && !state.currentQuestion) {
    createQuestion();
  }
}

function renderSurahList(searchTerm = "") {
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase("id");
  const filteredSurahs = state.surahs.filter((surah) => {
    return `${surah.namaLatin} ${surah.arti} ${surah.nomor}`
      .toLocaleLowerCase("id")
      .includes(normalizedSearch);
  });

  elements.surahList.replaceChildren();
  elements.surahCount.textContent = `${filteredSurahs.length} surat`;

  if (filteredSurahs.length === 0) {
    elements.surahListStatus.textContent = "Surat tidak ditemukan.";
    return;
  }

  elements.surahListStatus.textContent = "Pilih surat untuk membaca ayat.";
  const fragment = document.createDocumentFragment();

  for (const surah of filteredSurahs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "surah-item";
    button.dataset.surahNumber = String(surah.nomor);
    button.setAttribute("aria-pressed", String(state.selectedSurah?.nomor === surah.nomor));
    if (state.selectedSurah?.nomor === surah.nomor) {
      button.classList.add("is-selected");
    }

    const number = document.createElement("span");
    number.className = "surah-number";
    number.textContent = String(surah.nomor);

    const details = document.createElement("span");
    const latinName = document.createElement("span");
    latinName.className = "surah-name";
    latinName.textContent = surah.namaLatin;
    const metadata = document.createElement("span");
    metadata.className = "surah-detail";
    metadata.textContent = `${surah.arti} · ${surah.jumlahAyat} ayat`;
    details.append(latinName, metadata);

    const arabicName = document.createElement("span");
    arabicName.className = "surah-list-arabic";
    arabicName.lang = "ar";
    arabicName.dir = "rtl";
    arabicName.textContent = surah.nama;

    button.append(number, details, arabicName);
    fragment.append(button);
  }

  elements.surahList.append(fragment);
}

function renderVerses(verses) {
  const fragment = document.createDocumentFragment();

  for (const verse of verses) {
    const article = document.createElement("article");
    article.className = "verse-card";

    const number = document.createElement("span");
    number.className = "verse-index";
    number.textContent = String(verse.nomorAyat);

    const textGroup = document.createElement("div");
    const arabic = document.createElement("p");
    arabic.className = "verse-arabic";
    arabic.lang = "ar";
    arabic.dir = "rtl";
    arabic.textContent = verse.teksArab;
    textGroup.append(arabic);

    if (typeof verse.teksIndonesia === "string" && verse.teksIndonesia.trim()) {
      const translation = document.createElement("p");
      translation.className = "verse-translation";
      translation.textContent = verse.teksIndonesia;
      textGroup.append(translation);
    }

    article.append(number, textGroup);
    fragment.append(article);
  }

  elements.verseList.replaceChildren(fragment);
}

function clearSurahAudio() {
  elements.surahAudio.pause();
  elements.surahAudio.removeAttribute("src");
  elements.surahAudio.load();
  elements.reciterSelect.replaceChildren();
  elements.surahAudioPanel.hidden = true;
  elements.audioStatus.textContent = "";
}

function configureSurahAudio(audioFull) {
  clearSurahAudio();
  const reciters = Object.entries(audioFull ?? {}).filter(([, url]) => {
    if (typeof url !== "string" || !url.trim()) return false;
    try {
      return new URL(url).protocol === "https:";
    } catch {
      return false;
    }
  });

  elements.surahAudioPanel.hidden = false;
  if (reciters.length === 0) {
    elements.reciterSelect.hidden = true;
    elements.surahAudio.hidden = true;
    elements.audioStatus.textContent = "Audio surat tidak tersedia dari API.";
    return;
  }

  elements.reciterSelect.hidden = false;
  elements.surahAudio.hidden = false;
  for (const [id, url] of reciters) {
    const option = document.createElement("option");
    const pathParts = new URL(url).pathname.split("/").filter(Boolean);
    const reciterName = pathParts.at(-2)?.replaceAll("-", " ");
    option.value = url;
    option.textContent = reciterName || `Qari ${id}`;
    elements.reciterSelect.append(option);
  }

  elements.surahAudio.src = elements.reciterSelect.value;
  elements.surahAudio.load();
  elements.audioStatus.textContent = "Pilih putar pada pemutar untuk mendengarkan tilawah surat.";
}

async function selectSurah(surah) {
  const requestNumber = ++state.detailRequest;
  state.selectedSurah = surah;
  state.verses = [];
  state.currentQuestion = null;
  state.answered = false;
  renderSurahList(elements.surahSearch.value);
  elements.activeSurahName.textContent = surah.namaLatin;
  elements.questionArea.hidden = true;
  elements.nextQuestion.disabled = true;
  showQuizMessage("Membuka data surat...");
  elements.surahContent.hidden = true;
  clearSurahAudio();
  elements.readingStatus.hidden = false;
  elements.readingStatus.classList.remove("is-error");
  elements.readingStatus.innerHTML = '<span class="status-symbol" aria-hidden="true">…</span><p>Memuat ayat surat...</p>';

  try {
    const data = await fetchApi(`/surat/${surah.nomor}`);
    if (requestNumber !== state.detailRequest) return;
    if (!data || !Array.isArray(data.ayat)) {
      throw new Error("Daftar ayat tidak tersedia pada respons API.");
    }

    state.selectedSurah = data;
    state.verses = data.ayat;
    elements.readingTitle.textContent = data.namaLatin;
    elements.surahMeta.textContent = `SURAT ${data.nomor} · ${data.jumlahAyat} AYAT · ${data.tempatTurun}`;
    elements.surahArabicName.textContent = data.nama;
    configureSurahAudio(data.audioFull);
    renderVerses(data.ayat);
    elements.readingStatus.hidden = true;
    elements.surahContent.hidden = false;
    elements.activeSurahName.textContent = data.namaLatin;
    renderSurahList(elements.surahSearch.value);
    showQuizMessage("Surat siap. Tekan Soal Berikutnya untuk mulai.");
  } catch (error) {
    if (requestNumber !== state.detailRequest) return;
    elements.readingStatus.classList.add("is-error");
    elements.readingStatus.replaceChildren();
    const message = document.createElement("p");
    message.textContent = `Tidak dapat memuat surat. ${error.message} Periksa koneksi lalu coba lagi.`;
    elements.readingStatus.append(message);
    elements.surahContent.hidden = true;
    showQuizMessage("Data surat gagal dimuat. Pilih surat lagi untuk mencoba ulang.", true);
  }
}

function showQuizMessage(message, isError = false) {
  elements.quizMessage.textContent = message;
  elements.quizMessage.classList.toggle("is-error", isError);
  elements.quizMessage.hidden = false;
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffled(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function makeGuessQuestion() {
  const answerVerse = randomItem(state.verses);
  const distractors = shuffled(state.verses.filter((verse) => verse.nomorAyat !== answerVerse.nomorAyat)).slice(0, 2);
  const options = shuffled([
    { key: String(answerVerse.nomorAyat), label: String(answerVerse.nomorAyat), correct: true },
    ...distractors.map((verse) => ({
      key: String(verse.nomorAyat),
      label: String(verse.nomorAyat),
      correct: false
    }))
  ]);

  if (new Set(options.map((option) => option.key)).size !== 3) return null;
  return { prompt: answerVerse, options };
}

function makeContinuationQuestion() {
  const possibleQuestions = [];

  for (let index = 0; index < state.verses.length - 1; index += 1) {
    const prompt = state.verses[index];
    const nextVerse = state.verses[index + 1];
    const distractorVerses = shuffled(state.verses.filter((verse) => {
      return verse.nomorAyat !== prompt.nomorAyat
        && verse.nomorAyat !== nextVerse.nomorAyat
        && verse.teksArab !== nextVerse.teksArab;
    }));
    const uniqueDistractors = [];
    const seenTexts = new Set([nextVerse.teksArab]);

    for (const verse of distractorVerses) {
      if (seenTexts.has(verse.teksArab)) continue;
      seenTexts.add(verse.teksArab);
      uniqueDistractors.push(verse);
      if (uniqueDistractors.length === 2) break;
    }

    if (uniqueDistractors.length === 2) {
      possibleQuestions.push({ prompt, nextVerse, distractors: uniqueDistractors });
    }
  }

  if (possibleQuestions.length === 0) return null;

  const question = randomItem(possibleQuestions);
  const options = shuffled([
    { key: question.nextVerse.teksArab, label: question.nextVerse.teksArab, correct: true },
    ...question.distractors.map((verse) => ({
      key: verse.teksArab,
      label: verse.teksArab,
      correct: false
    }))
  ]);

  if (new Set(options.map((option) => option.key)).size !== 3) return null;
  return { prompt: question.prompt, options };
}

function createQuestion() {
  if (!state.selectedSurah) {
    showQuizMessage("Pilih surat di menu Al-Qur’an untuk mulai murajaah.");
    return;
  }

  if (state.verses.length < 4) {
    showQuizMessage("Surat ini memiliki kurang dari 4 ayat. Pilih surat lain agar pilihan jawaban tidak ambigu.", true);
    elements.questionArea.hidden = true;
    elements.nextQuestion.disabled = true;
    return;
  }

  const question = state.mode === "guess" ? makeGuessQuestion() : makeContinuationQuestion();
  if (!question) {
    showQuizMessage("Belum ada tiga pilihan berbeda yang bisa dibuat dari teks ayat surat ini. Pilih surat lain.", true);
    elements.questionArea.hidden = true;
    elements.nextQuestion.disabled = true;
    return;
  }

  state.currentQuestion = question;
  state.answered = false;
  elements.questionNumber.textContent = state.mode === "guess" ? "TEBAK NOMOR AYAT" : "SAMBUNG AYAT";
  elements.questionText.textContent = question.prompt.teksArab;
  elements.answerPrompt.textContent = state.mode === "guess"
    ? "Pilih nomor ayat yang ditampilkan."
    : "Ayat berikutnya yang tepat adalah...";
  elements.answerFeedback.textContent = "";
  elements.answerFeedback.className = "answer-feedback";
  elements.answerOptions.replaceChildren();

  for (const option of question.options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer-option";
    if (state.mode === "continue") {
      button.classList.add("is-arabic");
      button.lang = "ar";
      button.dir = "rtl";
    }
    button.dataset.answer = option.key;
    button.textContent = option.label;
    elements.answerOptions.append(button);
  }

  elements.quizMessage.hidden = true;
  elements.questionArea.hidden = false;
  elements.nextQuestion.disabled = false;
}

function answerQuestion(button) {
  if (state.answered || !state.currentQuestion) return;
  state.answered = true;
  const selectedKey = button.dataset.answer;
  const selectedOption = state.currentQuestion.options.find((option) => option.key === selectedKey);

  for (const optionButton of elements.answerOptions.querySelectorAll(".answer-option")) {
    const option = state.currentQuestion.options.find((item) => item.key === optionButton.dataset.answer);
    optionButton.disabled = true;
    if (option.correct) optionButton.classList.add("is-correct");
    if (optionButton === button && !option.correct) optionButton.classList.add("is-wrong");
  }

  if (selectedOption?.correct) {
    state.score += 10;
    elements.scoreValue.textContent = String(state.score);
    elements.answerFeedback.textContent = "Tepat! Skor bertambah 10 poin.";
    elements.answerFeedback.classList.add("is-correct");
  } else {
    elements.answerFeedback.textContent = "Belum tepat. Jawaban yang benar ditandai di atas.";
    elements.answerFeedback.classList.add("is-wrong");
  }
}

async function loadSurahs() {
  elements.surahListStatus.textContent = "Memuat daftar surat...";

  try {
    const data = await fetchApi("/surat");
    if (!Array.isArray(data)) {
      throw new Error("Daftar surat tidak tersedia pada respons API.");
    }

    state.surahs = data;
    renderSurahList(elements.surahSearch.value);
  } catch (error) {
    elements.surahCount.textContent = "Gagal dimuat";
    elements.surahListStatus.textContent = `Tidak dapat memuat daftar surat. ${error.message} Periksa koneksi lalu muat ulang halaman.`;
  }
}

elements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => setActiveView(tab.dataset.view));
});

elements.surahList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-surah-number]");
  if (!button) return;
  const surah = state.surahs.find((item) => item.nomor === Number(button.dataset.surahNumber));
  if (surah) selectSurah(surah);
});

elements.surahSearch.addEventListener("input", () => renderSurahList(elements.surahSearch.value));

elements.reciterSelect.addEventListener("change", () => {
  elements.surahAudio.pause();
  elements.surahAudio.src = elements.reciterSelect.value;
  elements.surahAudio.load();
  elements.audioStatus.textContent = "Qari diperbarui. Tekan putar untuk memulai.";
});

elements.surahAudio.addEventListener("error", () => {
  if (!elements.surahAudioPanel.hidden) {
    elements.audioStatus.textContent = "Audio gagal dimuat. Periksa koneksi lalu coba lagi.";
  }
});

elements.surahAudio.addEventListener("ended", () => {
  elements.audioStatus.textContent = "Tilawah surat selesai.";
});

elements.modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    elements.modeButtons.forEach((modeButton) => {
      const isActive = modeButton === button;
      modeButton.classList.toggle("is-active", isActive);
      modeButton.setAttribute("aria-pressed", String(isActive));
    });
    createQuestion();
  });
});

elements.answerOptions.addEventListener("click", (event) => {
  const button = event.target.closest(".answer-option");
  if (button) answerQuestion(button);
});

elements.nextQuestion.addEventListener("click", createQuestion);
elements.restartQuiz.addEventListener("click", () => {
  state.score = 0;
  elements.scoreValue.textContent = "0";
  createQuestion();
});

elements.chooseSurah.addEventListener("click", () => setActiveView("quran"));

loadSurahs();