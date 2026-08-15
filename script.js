const DEFAULT_FOCUS_DURATION_SECONDS = 30 * 60;
const DEFAULT_REST_DURATION_SECONDS = 5 * 60;
const FOCUS_RECORDS_STORAGE_KEY = "focusMusic.records.v1";
const APP_SETTINGS_STORAGE_KEY = "focusMusic.settings.v1";

const todayTotalElement = document.querySelector("#todayTotal");
const timerViewElement = document.querySelector("#timerView");
const statsViewElement = document.querySelector("#statsView");
const toggleStatsButton = document.querySelector("#toggleStats");
const closeStatsButton = document.querySelector("#closeStats");
const toggleSettingsButton = document.querySelector("#toggleSettings");
const settingsPanelElement = document.querySelector("#settingsPanel");
const includeMusicInFocusInput = document.querySelector("#includeMusicInFocus");
const statsMonthElement = document.querySelector("#statsMonth");
const monthTotalElement = document.querySelector("#monthTotal");
const activeDaysElement = document.querySelector("#activeDays");
const monthGridElement = document.querySelector("#monthGrid");
const timerElement = document.querySelector("#timer");
const restStateElement = document.querySelector("#restState");
const trackNameElement = document.querySelector("#trackName");
const toggleButton = document.querySelector("#toggleTimer");
const resetButton = document.querySelector("#resetTimer");
const fastForwardButton = document.querySelector("#fastForward");
const skipRestButton = document.querySelector("#skipRest");
const durationButtons = document.querySelectorAll(".duration-option");
const customDurationInput = document.querySelector("#customDuration");
const chooseMusicButton = document.querySelector("#chooseMusic");
const musicFolderInput = document.querySelector("#musicFolder");
const rewardAudio = document.querySelector("#rewardAudio");

const timerState = createTimerState(DEFAULT_FOCUS_DURATION_SECONDS);
let intervalId = undefined;
let musicFiles = [];
let currentAudioUrl = undefined;
let focusRecords = loadFocusRecords();
let appSettings = loadAppSettings();
let isShowingStats = false;
let isSettingsOpen = false;

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatTrackName(fileName) {
  return fileName.replace(/\.[^/.]+$/, "");
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function createMemoryStorage(initialValue) {
  let value = initialValue;

  return {
    getItem() {
      return value;
    },
    setItem(_key, nextValue) {
      value = nextValue;
    },
  };
}

function createDefaultSettings() {
  return {
    includeMusicInFocus: false,
  };
}

function loadAppSettings(storage = window.localStorage) {
  try {
    const rawSettings = storage.getItem(APP_SETTINGS_STORAGE_KEY);

    if (!rawSettings) {
      return createDefaultSettings();
    }

    const settings = JSON.parse(rawSettings);

    return {
      ...createDefaultSettings(),
      ...(settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {}),
    };
  } catch {
    return createDefaultSettings();
  }
}

function saveAppSettings(settings, storage = window.localStorage) {
  storage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function loadFocusRecords(storage = window.localStorage) {
  try {
    const rawRecords = storage.getItem(FOCUS_RECORDS_STORAGE_KEY);

    if (!rawRecords) {
      return {};
    }

    const records = JSON.parse(rawRecords);
    return records && typeof records === "object" && !Array.isArray(records) ? records : {};
  } catch {
    return {};
  }
}

function saveFocusRecords(records, storage = window.localStorage) {
  storage.setItem(FOCUS_RECORDS_STORAGE_KEY, JSON.stringify(records));
}

function addFocusRecord(records, durationSeconds, date = new Date()) {
  const dateKey = getLocalDateKey(date);
  const currentSeconds = Number(records[dateKey]) || 0;

  records[dateKey] = currentSeconds + durationSeconds;
  return records[dateKey];
}

function formatFocusMinutes(totalSeconds) {
  return Math.round(totalSeconds / 60);
}

function getMonthKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function getMonthDays(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();

  return new Date(year, month + 1, 0).getDate();
}

function getMonthStartOffset(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
}

function getMonthlyStats(records, date = new Date()) {
  const monthKey = getMonthKey(date);
  const daysInMonth = getMonthDays(date);
  const days = [];
  let totalSeconds = 0;
  let activeDays = 0;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${monthKey}-${String(day).padStart(2, "0")}`;
    const seconds = Number(records[dateKey]) || 0;

    totalSeconds += seconds;

    if (seconds > 0) {
      activeDays += 1;
    }

    days.push({
      day,
      seconds,
      minutes: formatFocusMinutes(seconds),
    });
  }

  return {
    activeDays,
    days,
    monthKey,
    startOffset: getMonthStartOffset(date),
    totalMinutes: formatFocusMinutes(totalSeconds),
    totalSeconds,
  };
}

function getDayLevel(minutes) {
  if (minutes <= 0) return 0;
  if (minutes < 30) return 1;
  if (minutes < 60) return 2;
  if (minutes < 120) return 3;
  return 4;
}

function createTimerState(durationSeconds) {
  return {
    durationSeconds,
    remainingSeconds: durationSeconds,
    isRunning: false,
    hasStarted: false,
    mode: "idle",
    currentTrackName: "",
    restRemainingSeconds: 0,
    restUsesMusic: false,
    focusEndsAt: undefined,
    restEndsAt: undefined,
  };
}

function startState(state, now = Date.now()) {
  if (state.remainingSeconds <= 0) {
    state.remainingSeconds = state.durationSeconds;
  }

  state.isRunning = true;
  state.hasStarted = true;
  state.mode = "focusing";
  state.focusEndsAt = now + state.remainingSeconds * 1000;
}

function pauseState(state, now = Date.now()) {
  if (state.isRunning && state.focusEndsAt) {
    state.remainingSeconds = Math.max(0, Math.ceil((state.focusEndsAt - now) / 1000));
  }

  state.isRunning = false;
  state.focusEndsAt = undefined;
}

function resetState(state) {
  state.remainingSeconds = state.durationSeconds;
  state.isRunning = false;
  state.hasStarted = false;
  state.mode = "idle";
  state.currentTrackName = "";
  state.restRemainingSeconds = 0;
  state.restUsesMusic = false;
  state.focusEndsAt = undefined;
  state.restEndsAt = undefined;
}

function tickState(state, now = Date.now()) {
  if (!state.isRunning) {
    return;
  }

  state.remainingSeconds = Math.max(0, Math.ceil((state.focusEndsAt - now) / 1000));

  if (state.remainingSeconds === 0) {
    state.isRunning = false;
    state.mode = "resting";
    state.focusEndsAt = undefined;
  }
}

function finishFocusState(state) {
  state.remainingSeconds = 0;
  state.isRunning = false;
  state.hasStarted = true;
  state.mode = "resting";
  state.focusEndsAt = undefined;
}

function canChangeDuration(state) {
  return state.mode === "idle" && !state.hasStarted && !state.isRunning;
}

function setDurationState(state, durationSeconds) {
  if (!canChangeDuration(state)) {
    return false;
  }

  state.durationSeconds = durationSeconds;
  state.remainingSeconds = durationSeconds;
  return true;
}

function clampDurationMinutes(minutes) {
  if (!Number.isFinite(minutes)) {
    return undefined;
  }

  return Math.min(120, Math.max(1, Math.round(minutes)));
}

function setDurationMinutesState(state, minutes) {
  const clampedMinutes = clampDurationMinutes(minutes);

  if (!clampedMinutes) {
    return false;
  }

  return setDurationState(state, clampedMinutes * 60);
}

function setRestingState(state, trackName, restSeconds = 0, now = Date.now()) {
  state.isRunning = false;
  state.hasStarted = true;
  state.mode = "resting";
  state.currentTrackName = trackName;
  state.restRemainingSeconds = restSeconds;
  state.restUsesMusic = restSeconds === 0;
  state.restEndsAt = restSeconds > 0 ? now + restSeconds * 1000 : undefined;
}

function tickRestState(state, now = Date.now()) {
  if (state.mode !== "resting" || state.restUsesMusic) {
    return;
  }

  state.restRemainingSeconds = Math.max(0, Math.ceil((state.restEndsAt - now) / 1000));
}

function pickRandomFile(files, random = Math.random) {
  if (files.length === 0) {
    return undefined;
  }

  return files[Math.floor(random() * files.length)];
}

function render() {
  const isResting = timerState.mode === "resting";

  timerViewElement.hidden = isShowingStats;
  statsViewElement.hidden = !isShowingStats;
  toggleStatsButton.hidden = isShowingStats;
  toggleSettingsButton.hidden = isShowingStats;
  settingsPanelElement.hidden = !isSettingsOpen || isShowingStats;
  toggleSettingsButton.setAttribute("aria-label", isSettingsOpen ? "关闭设置" : "打开设置");
  includeMusicInFocusInput.checked = appSettings.includeMusicInFocus;

  todayTotalElement.textContent = `今日 ${formatFocusMinutes(focusRecords[getLocalDateKey()] || 0)} 分钟`;
  timerElement.textContent = formatTime(timerState.remainingSeconds);
  timerElement.classList.toggle("is-hidden", isResting);
  restStateElement.hidden = !isResting;
  trackNameElement.textContent = timerState.currentTrackName;
  trackNameElement.hidden = timerState.currentTrackName.length === 0;

  if (isResting && !timerState.restUsesMusic) {
    timerElement.textContent = formatTime(timerState.restRemainingSeconds);
    timerElement.classList.remove("is-hidden");
  }

  toggleButton.classList.toggle("is-running", timerState.isRunning);
  toggleButton.setAttribute("aria-label", timerState.isRunning ? "暂停" : "开始");
  toggleButton.disabled = isResting;
  fastForwardButton.hidden = timerState.mode !== "focusing" || !timerState.hasStarted;

  durationButtons.forEach((button) => {
    const buttonDurationSeconds = Number(button.dataset.duration) * 60;
    const isSelected = buttonDurationSeconds === timerState.durationSeconds;

    button.classList.toggle("is-selected", isSelected);
    button.disabled = !canChangeDuration(timerState);
  });

  customDurationInput.disabled = !canChangeDuration(timerState);

  if (isShowingStats) {
    renderStats();
  }
}

function renderStats() {
  const stats = getMonthlyStats(focusRecords);

  statsMonthElement.textContent = stats.monthKey;
  monthTotalElement.textContent = stats.totalMinutes;
  activeDaysElement.textContent = stats.activeDays;
  monthGridElement.textContent = "";

  for (let index = 0; index < stats.startOffset; index += 1) {
    const emptyCell = document.createElement("div");
    emptyCell.className = "day-cell is-empty";
    monthGridElement.append(emptyCell);
  }

  stats.days.forEach((day) => {
    const dayCell = document.createElement("div");
    const dayNumber = document.createElement("div");
    const dayMinutes = document.createElement("div");

    dayCell.className = "day-cell";
    dayCell.dataset.level = String(getDayLevel(day.minutes));
    dayCell.setAttribute("aria-label", `${day.day} 日，${day.minutes} 分钟`);

    dayNumber.className = "day-number";
    dayNumber.textContent = String(day.day);

    dayMinutes.className = "day-minutes";
    dayMinutes.textContent = day.minutes > 0 ? `${day.minutes}` : "";

    dayCell.append(dayNumber, dayMinutes);
    monthGridElement.append(dayCell);
  });
}

function stopInterval() {
  window.clearInterval(intervalId);
  intervalId = undefined;
}

function releaseAudioUrl() {
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = undefined;
  }
}

function stopRewardAudio() {
  rewardAudio.pause();
  rewardAudio.removeAttribute("src");
  rewardAudio.load();
  releaseAudioUrl();
}

function playRestMusic() {
  const musicFile = pickRandomFile(musicFiles);

  if (!musicFile) {
    setRestingState(timerState, "", DEFAULT_REST_DURATION_SECONDS);
    render();
    intervalId = window.setInterval(() => {
      tickRestState(timerState);

      if (timerState.restRemainingSeconds === 0) {
        stopInterval();
        resetState(timerState);
        startTimer();
        return;
      }

      render();
    }, 1000);
    return;
  }

  releaseAudioUrl();
  currentAudioUrl = URL.createObjectURL(musicFile);
  rewardAudio.src = currentAudioUrl;
  setRestingState(timerState, formatTrackName(musicFile.name));
  render();

  rewardAudio.play().catch(() => {
    stopRewardAudio();
    resetState(timerState);
    render();
  });
}

function recordCompletedFocus() {
  addFocusRecord(focusRecords, timerState.durationSeconds);
  saveFocusRecords(focusRecords);
}

function completeCurrentFocus({ shouldRecord = true } = {}) {
  stopInterval();
  finishFocusState(timerState);

  if (shouldRecord) {
    recordCompletedFocus();
  }

  playRestMusic();
  render();
}

function startTimer() {
  stopRewardAudio();
  startState(timerState);
  render();

  intervalId = window.setInterval(() => {
    tickState(timerState);

    if (!timerState.isRunning) {
      completeCurrentFocus();
      return;
    }

    render();
  }, 1000);
}

function pauseTimer() {
  pauseState(timerState);
  stopInterval();
  render();
}

function resetTimer() {
  resetState(timerState);
  stopInterval();
  stopRewardAudio();
  render();
}

function skipRest() {
  stopInterval();
  stopRewardAudio();
  resetState(timerState);
  render();
}

toggleButton.addEventListener("click", () => {
  if (timerState.isRunning) {
    pauseTimer();
    return;
  }

  startTimer();
});

resetButton.addEventListener("click", resetTimer);

fastForwardButton.addEventListener("click", () => {
  if (timerState.mode !== "focusing" || !timerState.hasStarted) {
    return;
  }

  completeCurrentFocus({ shouldRecord: false });
});

skipRestButton.addEventListener("click", skipRest);

toggleStatsButton.addEventListener("click", () => {
  isSettingsOpen = false;
  isShowingStats = true;
  render();
});

closeStatsButton.addEventListener("click", () => {
  isShowingStats = false;
  render();
});

toggleSettingsButton.addEventListener("click", () => {
  isSettingsOpen = !isSettingsOpen;
  render();
});

includeMusicInFocusInput.addEventListener("change", () => {
  appSettings = {
    ...appSettings,
    includeMusicInFocus: includeMusicInFocusInput.checked,
  };
  saveAppSettings(appSettings);
  render();
});

chooseMusicButton.addEventListener("click", () => {
  musicFolderInput.click();
});

musicFolderInput.addEventListener("change", () => {
  musicFiles = Array.from(musicFolderInput.files).filter((file) =>
    file.name.toLowerCase().endsWith(".mp3"),
  );
  render();
});

document.addEventListener("click", (event) => {
  const clickedInsideSettings =
    settingsPanelElement.contains(event.target) ||
    toggleSettingsButton.contains(event.target);
  const clickedInsideStats =
    statsViewElement.contains(event.target) || toggleStatsButton.contains(event.target);
  let shouldRender = false;

  if (isSettingsOpen && !clickedInsideSettings) {
    isSettingsOpen = false;
    shouldRender = true;
  }

  if (isShowingStats && !clickedInsideStats) {
    isShowingStats = false;
    shouldRender = true;
  }

  if (shouldRender) {
    render();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (!isSettingsOpen && !isShowingStats) {
    return;
  }

  isSettingsOpen = false;
  isShowingStats = false;
  render();
});

rewardAudio.addEventListener("ended", () => {
  releaseAudioUrl();
  resetState(timerState);
  startTimer();
});

durationButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const durationMinutes = Number(button.dataset.duration);

    if (setDurationMinutesState(timerState, durationMinutes)) {
      customDurationInput.value = "";
      render();
    }
  });
});

customDurationInput.addEventListener("focus", () => {
  customDurationInput.value = "";
});

customDurationInput.addEventListener("input", () => {
  if (customDurationInput.value === "") {
    return;
  }

  const durationMinutes = Number(customDurationInput.value);

  if (setDurationMinutesState(timerState, durationMinutes)) {
    render();
  }
});

customDurationInput.addEventListener("blur", () => {
  if (customDurationInput.value === "") {
    return;
  }

  const clampedMinutes = clampDurationMinutes(Number(customDurationInput.value));

  if (!clampedMinutes) {
    customDurationInput.value = "";
    return;
  }

  customDurationInput.value = String(clampedMinutes);
  setDurationMinutesState(timerState, clampedMinutes);
  render();
});

customDurationInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    customDurationInput.blur();
  }
});

render();

if (typeof module !== "undefined") {
  module.exports = {
    canChangeDuration,
    clampDurationMinutes,
    createDefaultSettings,
    createTimerState,
    createMemoryStorage,
    formatTrackName,
    formatTime,
    addFocusRecord,
    formatFocusMinutes,
    finishFocusState,
    getLocalDateKey,
    getDayLevel,
    getMonthlyStats,
    getMonthDays,
    getMonthKey,
    getMonthStartOffset,
    loadAppSettings,
    loadFocusRecords,
    pauseState,
    pickRandomFile,
    resetState,
    saveAppSettings,
    saveFocusRecords,
    setDurationMinutesState,
    setDurationState,
    setRestingState,
    startState,
    tickRestState,
    tickState,
  };
}
