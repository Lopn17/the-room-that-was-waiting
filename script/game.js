(() => {
  "use strict";

  const HOLD_DURATION = 4000;
  const CHASE_DURATION = 15000;
  const JUMPSCARE_DURATION = 5000;
  const scenes = [...document.querySelectorAll(".scene")];
  const dialogueBox = document.getElementById("dialogueBox");
  const dialogueText = document.getElementById("dialogueText");
  const speaker = document.getElementById("speaker");
  const toast = document.getElementById("toast");

  const startGameButton = document.getElementById("startGame");
  const lightSwitchDark = document.getElementById("lightSwitchDark");
  const bedroomDoor = document.getElementById("bedroomDoor");
  const returnRoom = document.getElementById("returnRoom");
  const radioItem = document.getElementById("radioItem");
  const keyItem = document.getElementById("keyItem");
  const giftDoor = document.getElementById("giftDoor");
  const inventory = document.getElementById("inventory");
  const lookBackButton = document.getElementById("lookBackButton");
  const ghostReveal = document.getElementById("ghostReveal");
  const ghostImage = document.getElementById("ghostImage");
  const unlockPanel = document.getElementById("unlockPanel");
  const unlockInstruction = document.getElementById("unlockInstruction");
  const holdDoor = document.getElementById("holdDoor");
  const unlockProgress = document.getElementById("unlockProgress");
  const progressNumber = document.getElementById("progressNumber");
  const sceneChase = document.getElementById("sceneChase");
  const chaseTimer = document.getElementById("chaseTimer");
  const chaseTimerValue = document.getElementById("chaseTimerValue");
  const gameOverModal = document.getElementById("gameOverModal");
  const gameOverRestart = document.getElementById("gameOverRestart");
  const finalLight = document.getElementById("finalLight");
  const confettiLayer = document.getElementById("confettiLayer");
  const finalCard = document.getElementById("finalCard");
  const finalEnding = document.getElementById("finalEnding");
  const continueFinal = document.getElementById("continueFinal");
  const restartGame = document.getElementById("restartGame");
  const soundToggle = document.getElementById("soundToggle");
  const openWatch = document.getElementById("openWatch");
  const closeWatch = document.getElementById("closeWatch");
  const watchOverlay = document.getElementById("watchOverlay");
  const watchFrame = document.getElementById("watchFrame");

  const audio = {
    switch: document.getElementById("switchAudio"),
    door: document.getElementById("doorAudio"),
    haunted: document.getElementById("hauntedAudio"),
    blast: document.getElementById("blastAudio"),
    humming: document.getElementById("hummingAudio"),
    footsteps: document.getElementById("footstepsAudio"),
    aboutYou: document.getElementById("aboutYouAudio"),
    radio: document.getElementById("radioAudio"),
    jumpscare: document.getElementById("jumpscareAudio")
  };

  let soundEnabled = true;
  let busy = false;
  let toastTimer = null;
  let chasePhase = 0;
  let isHolding = false;
  let holdStart = 0;
  let holdFrame = 0;
  let holdPointerId = null;
  let unlocked = false;
  let chaseDeadline = 0;
  let chaseTimerFrame = 0;
  let chaseFailureTimer = 0;
  let chaseFailed = false;
  let activeDialogueCancel = null;

  const state = {
    hasKey: localStorage.getItem("maeghanHasKey") === "true",
    checkpoint: localStorage.getItem("maeghanCheckpoint") || "start",
    firstHallwaySeen: localStorage.getItem("maeghanFirstHallway") === "true"
  };

  const sceneById = (id) => document.getElementById(id);

  function setScene(id) {
    scenes.forEach((scene) => scene.classList.toggle("is-active", scene.id === id));
  }

  function hide(element) {
    element.classList.add("hidden");
  }

  function show(element) {
    element.classList.remove("hidden");
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function safePlay(track, { restart = false } = {}) {
    if (!soundEnabled || !track) return;
    try {
      if (restart) track.currentTime = 0;
      await track.play();
    } catch (error) {
      // Browsers can reject audio playback before a user gesture. The game continues normally.
    }
  }

  function stopTrack(track, reset = false) {
    if (!track) return;
    track.pause();
    if (reset) track.currentTime = 0;
  }

  function stopAllAudio() {
    Object.values(audio).forEach((track) => stopTrack(track, false));
    setRadioPlaying(false);
  }

  function setTrackVolume(track, volume) {
    if (track) track.volume = Math.max(0, Math.min(1, volume));
  }

  setTrackVolume(audio.haunted, 0.55);
  setTrackVolume(audio.humming, 0.70);
  setTrackVolume(audio.footsteps, 0.70);
  setTrackVolume(audio.aboutYou, 0.48);
  setTrackVolume(audio.door, 0.72);
  setTrackVolume(audio.switch, 0.72);
  setTrackVolume(audio.blast, 0.5);
  setTrackVolume(audio.radio, 0.60);
  setTrackVolume(audio.jumpscare, 0.90);

  function showToast(message, duration = 2800) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = setTimeout(() => toast.classList.remove("show"), duration);
  }

  function setRadioPlaying(isPlaying) {
    radioItem.classList.toggle("is-playing", isPlaying);
    radioItem.setAttribute("aria-pressed", String(isPlaying));
  }

  async function toggleRadio() {
    if (document.querySelector(".scene.is-active")?.id !== "sceneGiftRoom") return;

    if (!soundEnabled) {
      showToast("Sound is off. Turn SOUND: ON first.", 2400);
      return;
    }

    if (audio.radio.paused) {
      await safePlay(audio.radio);
      setRadioPlaying(!audio.radio.paused);
      if (!audio.radio.paused) showToast("The broken radio crackles to life.", 2300);
      return;
    }

    stopTrack(audio.radio, false);
    setRadioPlaying(false);
    showToast("The broken radio goes quiet.", 2100);
  }

  function stopRadio(reset = false) {
    stopTrack(audio.radio, reset);
    setRadioPlaying(false);
  }

  function typeLine(text, speed = 25) {
    return new Promise((resolve) => {
      dialogueText.textContent = "";
      let index = 0;
      let complete = false;
      let settled = false;
      let intervalId = null;

      const finishTyping = () => {
        if (complete) return;
        complete = true;
        clearInterval(intervalId);
        dialogueText.textContent = text;
      };

      intervalId = window.setInterval(() => {
        dialogueText.textContent += text[index] || "";
        index += 1;
        if (index >= text.length) {
          finishTyping();
        }
      }, speed);

      const finishLine = (didAdvance) => {
        if (settled) return;
        settled = true;
        clearInterval(intervalId);
        dialogueBox.removeEventListener("click", advance);
        if (activeDialogueCancel === cancelLine) activeDialogueCancel = null;
        resolve(didAdvance);
      };

      const advance = () => {
        if (!complete) {
          finishTyping();
          return;
        }
        finishLine(true);
      };

      const cancelLine = () => finishLine(false);
      if (activeDialogueCancel) activeDialogueCancel();
      activeDialogueCancel = cancelLine;
      dialogueBox.addEventListener("click", advance);
    });
  }

  async function say(lines, who = "ME") {
    show(dialogueBox);
    speaker.textContent = who;

    for (const line of lines) {
      const didAdvance = await typeLine(line);
      if (!didAdvance) {
        hide(dialogueBox);
        dialogueText.textContent = "";
        return false;
      }
    }

    hide(dialogueBox);
    dialogueText.textContent = "";
    return true;
  }

  function sayUntilClick(line, who = "ME") {
    show(dialogueBox);
    speaker.textContent = who;
    dialogueText.textContent = line;

    return new Promise((resolve) => {
      let settled = false;

      const finish = (didAdvance) => {
        if (settled) return;
        settled = true;
        dialogueBox.removeEventListener("click", advance);
        if (activeDialogueCancel === cancel) activeDialogueCancel = null;
        hide(dialogueBox);
        dialogueText.textContent = "";
        resolve(didAdvance);
      };

      const advance = () => finish(true);
      const cancel = () => finish(false);

      if (activeDialogueCancel) activeDialogueCancel();
      activeDialogueCancel = cancel;
      dialogueBox.addEventListener("click", advance);
    });
  }

  function cancelDialogue() {
    if (activeDialogueCancel) activeDialogueCancel();
    hide(dialogueBox);
    dialogueText.textContent = "";
  }

  function updateInventory() {
    inventory.hidden = !state.hasKey;
    keyItem.classList.toggle("is-collected", state.hasKey);
  }

  function createConfetti(count = 90) {
    confettiLayer.innerHTML = "";
    for (let i = 0; i < count; i += 1) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.setProperty("--hue", `${Math.floor(Math.random() * 360)}`);
      piece.style.setProperty("--duration", `${5 + Math.random() * 5}s`);
      piece.style.setProperty("--delay", `${-Math.random() * 8}s`);
      piece.style.setProperty("--drift", `${-80 + Math.random() * 160}px`);
      confettiLayer.appendChild(piece);
    }
  }

  async function beginExperience() {
    if (busy) return;
    busy = true;
    startGameButton.disabled = true;

    if (state.checkpoint === "gift-room") {
      setScene("sceneGiftRoom");
      updateInventory();
      showToast(
        state.hasKey
          ? "Welcome back, Maeghan. The old key is still in your inventory."
          : "Welcome back, Maeghan. The strange objects are still where you left them.",
        4200
      );
      busy = false;
      return;
    }

    if (state.checkpoint === "final-room") {
      inventory.hidden = true;
      setScene("sceneFinal");
      createConfetti();
      await safePlay(audio.aboutYou, { restart: true });
      busy = false;
      return;
    }

    setScene("sceneDark");
    await sleep(650);
    await say([
      "Maeghan...?",
      "Are you awake?",
      "Why is it so dark in here?",
      "Maybe you should turn on the light."
    ]);
    show(lightSwitchDark);
    busy = false;
  }

  async function turnOnBedroomLight() {
    if (busy) return;
    busy = true;
    hide(lightSwitchDark);
    await safePlay(audio.switch, { restart: true });
    setScene("sceneBedroom");
    await sleep(800);
    await say([
      "Okay... that's better.",
      "This room is completely empty.",
      "Let's see if anyone is outside."
    ]);
    show(bedroomDoor);
    busy = false;
  }

  async function enterHauntedHallway(repeat = false) {
    if (busy) return;
    busy = true;
    hide(bedroomDoor);
    stopRadio(true);
    await safePlay(audio.door, { restart: true });
    setScene("sceneHaunted");
    await sleep(700);
    await safePlay(audio.haunted, { restart: true });

    const lines = repeat
      ? [
          "Nope. The hallway is still full of them.",
          "That door at the end won't help us without a key.",
          "Back inside. Quickly."
        ]
      : [
          "Hey...",
          "Maybe it was a bad idea to come out here.",
          "Things are definitely not normal in this hallway.",
          "I think we should go back inside."
        ];

    await say(lines);
    show(returnRoom);
    state.firstHallwaySeen = true;
    localStorage.setItem("maeghanFirstHallway", "true");
    busy = false;
  }

  async function returnToGiftRoom() {
    if (busy) return;
    busy = true;
    hide(returnRoom);
    stopTrack(audio.haunted, true);
    await safePlay(audio.door, { restart: true });
    setScene("sceneGiftRoom");
    state.checkpoint = "gift-room";
    localStorage.setItem("maeghanCheckpoint", "gift-room");
    updateInventory();
    await sleep(700);

    if (!sessionStorage.getItem("maeghanGiftIntroSeen")) {
      showToast(
        "We're back. Wait... these things weren't here before. Maybe this room wants to show you something.",
        5200
      );
      sessionStorage.setItem("maeghanGiftIntroSeen", "true");
    }

    busy = false;
  }

  function collectKey() {
    if (state.hasKey || busy) return;
    state.hasKey = true;
    localStorage.setItem("maeghanHasKey", "true");
    updateInventory();
    showToast("You found an old key. Maybe you should try the hallway again.", 3900);
  }

  async function tryGiftDoor() {
    if (busy) return;
    if (!state.hasKey) {
      showToast("The door is locked. There must be a key somewhere in the room.");
      await sleep(650);
      await enterHauntedHallway(true);
      return;
    }
    await startChaseHallway();
  }

  async function startChaseHallway() {
    if (busy) return;
    busy = true;
    chasePhase = 0;
    unlocked = false;
    chaseFailed = false;
    stopChaseCountdown(true);
    resetHold(true);
    gameOverModal.hidden = true;
    sceneChase.classList.remove("is-final-door", "is-looking-back", "is-jumpscare", "is-panicking");
    ghostReveal.classList.remove("is-visible", "is-approaching", "is-jumpscare");
    ghostImage.src = "assets/images/ghost-woman.png";
    hide(unlockPanel);
    hide(lookBackButton);
    stopTrack(audio.haunted, true);
    stopTrack(audio.humming, true);
    stopTrack(audio.footsteps, true);
    stopTrack(audio.jumpscare, true);
    stopRadio(true);
    await safePlay(audio.door, { restart: true });
    setScene("sceneChase");
    await sleep(850);

    await say([
      "The ghosts are finally gone.",
      "We can finally go to the other room."
    ]);

    sceneChase.classList.add("is-final-door");
    await safePlay(audio.humming, { restart: true });
    await sleep(750);
    await say(["What is that humming?"]);
    lookBackButton.textContent = "LOOK BACK";
    show(lookBackButton);
    chasePhase = 1;
    busy = false;
  }

  function formatChaseTime(milliseconds) {
    const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
    return `00:${String(seconds).padStart(2, "0")}`;
  }

  function updateChaseTimer() {
    if (!chaseDeadline || unlocked || chaseFailed) return;

    const remaining = Math.max(0, chaseDeadline - performance.now());
    chaseTimerValue.textContent = formatChaseTime(remaining);
    chaseTimer.classList.toggle("is-danger", remaining <= 5000);

    if (remaining > 0) {
      chaseTimerFrame = requestAnimationFrame(updateChaseTimer);
    }
  }

  function startChaseCountdown() {
    clearTimeout(chaseFailureTimer);
    cancelAnimationFrame(chaseTimerFrame);
    chaseDeadline = performance.now() + CHASE_DURATION;
    chaseTimerValue.textContent = formatChaseTime(CHASE_DURATION);
    chaseTimer.classList.remove("is-danger");
    show(chaseTimer);
    chaseTimerFrame = requestAnimationFrame(updateChaseTimer);
    chaseFailureTimer = window.setTimeout(triggerJumpscare, CHASE_DURATION);
  }

  function stopChaseCountdown(hideDisplay = false) {
    clearTimeout(chaseFailureTimer);
    cancelAnimationFrame(chaseTimerFrame);
    chaseFailureTimer = 0;
    chaseTimerFrame = 0;
    chaseDeadline = 0;
    chaseTimer.classList.remove("is-danger");
    if (hideDisplay) hide(chaseTimer);
  }

  async function lookBack() {
    if (busy || chaseFailed || unlocked || chasePhase < 1) return;
    busy = true;
    const isFirstLook = chasePhase === 1;

    if (isHolding) resetHold(false);
    hide(lookBackButton);
    hide(unlockPanel);

    if (isFirstLook) {
      chasePhase = 2;
      startChaseCountdown();
      audio.footsteps.playbackRate = 1;
      void safePlay(audio.footsteps, { restart: true });
      ghostImage.src = "assets/images/ghost-woman.png";
      ghostReveal.classList.remove("is-visible", "is-approaching", "is-jumpscare");
      void ghostReveal.offsetWidth;
      ghostReveal.classList.add("is-visible", "is-approaching");
    } else {
      ghostReveal.classList.add("is-visible");
    }

    sceneChase.classList.remove("is-final-door");
    sceneChase.classList.add("is-looking-back");
    if (isFirstLook) {
      await say([
        "OMG!",
        "We need to be quick."
      ]);
    } else {
      await sayUntilClick("STOP LOOKING BACK!");
    }

    if (chaseFailed || unlocked) return;

    ghostReveal.classList.remove("is-visible");
    sceneChase.classList.remove("is-looking-back");
    sceneChase.classList.add("is-final-door");
    show(unlockPanel);
    lookBackButton.textContent = "LOOK BACK AGAIN";
    show(lookBackButton);
    unlockInstruction.textContent = "Quick! Hold the door!";
    busy = false;
  }

  async function triggerJumpscare() {
    if (unlocked || chaseFailed || chasePhase < 2) return;

    chaseFailed = true;
    chasePhase = 4;
    busy = true;
    clearTimeout(chaseFailureTimer);
    cancelAnimationFrame(chaseTimerFrame);
    chaseDeadline = 0;
    chaseTimerValue.textContent = "00:00";
    chaseTimer.classList.add("is-danger");
    isHolding = false;
    cancelAnimationFrame(holdFrame);
    holdDoor.classList.remove("is-holding");
    hide(unlockPanel);
    hide(lookBackButton);
    cancelDialogue();
    sceneChase.classList.remove("is-final-door", "is-panicking");
    sceneChase.classList.add("is-looking-back", "is-jumpscare");
    ghostImage.src = "assets/images/jumpscare-ghost.png";
    ghostReveal.classList.remove("is-approaching");
    ghostReveal.classList.add("is-visible", "is-jumpscare");
    stopTrack(audio.humming, true);
    stopTrack(audio.footsteps, true);
    await safePlay(audio.jumpscare, { restart: true });
    await sleep(JUMPSCARE_DURATION);

    ghostReveal.classList.remove("is-visible", "is-jumpscare");
    sceneChase.classList.remove("is-jumpscare");
    hide(chaseTimer);
    stopTrack(audio.jumpscare, true);
    gameOverModal.hidden = false;
    gameOverRestart.focus();
  }

  function holdMessage(progress) {
    if (progress < 0.08) return "Quick! Hold the door!";
    if (progress < 0.36) return "Inserting the key...";
    if (progress < 0.7) return "Hold on...";
    if (progress < 0.91) return "Almost there...";
    return "Don't let go!";
  }

  function updateHold(timestamp) {
    if (!isHolding || unlocked) return;
    const elapsed = timestamp - holdStart;
    const ratio = Math.min(1, elapsed / HOLD_DURATION);
    const percent = Math.round(ratio * 100);

    unlockProgress.style.width = `${percent}%`;
    progressNumber.textContent = `${percent}%`;
    holdDoor.style.setProperty("--progress", `${ratio * 360}deg`);
    unlockInstruction.textContent = holdMessage(ratio);
    audio.footsteps.playbackRate = 1 + ratio * 0.9;
    setTrackVolume(audio.footsteps, 0.32 + ratio * 0.34);
    setTrackVolume(audio.humming, 0.34 + ratio * 0.26);

    if (ratio >= 1) {
      finishUnlock();
      return;
    }

    holdFrame = requestAnimationFrame(updateHold);
  }

  function canBeginHold() {
    return (
      sceneChase.classList.contains("is-active") &&
      !unlockPanel.classList.contains("hidden") &&
      !isHolding &&
      !unlocked &&
      !chaseFailed &&
      chasePhase >= 2
    );
  }

  function startHolding() {
    isHolding = true;
    holdStart = performance.now();
    holdDoor.classList.add("is-holding");
    sceneChase.classList.add("is-panicking");
    holdFrame = requestAnimationFrame(updateHold);
  }

  function beginHold(event) {
    if (!canBeginHold()) return;
    event.preventDefault();
    holdPointerId = event.pointerId;
    try {
      holdDoor.setPointerCapture(event.pointerId);
    } catch (error) {
      // Pointer capture is optional on older browsers; holding still works without it.
    }
    startHolding();
  }

  function beginSpaceHold(event) {
    if (event.code !== "Space" || event.repeat || !canBeginHold()) return;
    event.preventDefault();
    holdPointerId = null;
    startHolding();
  }

  function resetHold(silent = false) {
    if (unlocked) return;
    try {
      if (
        holdPointerId !== null &&
        holdDoor.hasPointerCapture?.(holdPointerId)
      ) {
        holdDoor.releasePointerCapture(holdPointerId);
      }
    } catch (error) {
      // The browser may already have released capture after pointerup.
    }
    holdPointerId = null;
    isHolding = false;
    cancelAnimationFrame(holdFrame);
    holdDoor.classList.remove("is-holding");
    sceneChase.classList.remove("is-panicking");
    unlockProgress.style.width = "0%";
    progressNumber.textContent = "0%";
    holdDoor.style.setProperty("--progress", "0deg");
    unlockInstruction.textContent = silent ? "Quick! Hold the door!" : "Don't let go! Try again!";
    if (!silent) {
      audio.footsteps.playbackRate = Math.max(audio.footsteps.playbackRate, 1.25);
      window.setTimeout(() => {
        if (!isHolding && !unlocked) unlockInstruction.textContent = "Quick! Hold the door!";
      }, 850);
    }
  }

  async function finishUnlock() {
    if (unlocked || chaseFailed) return;
    unlocked = true;
    busy = true;
    isHolding = false;
    holdPointerId = null;
    stopChaseCountdown(true);
    inventory.hidden = true;
    cancelAnimationFrame(holdFrame);
    holdDoor.classList.remove("is-holding");
    sceneChase.classList.remove("is-panicking");
    hide(lookBackButton);
    unlockInstruction.textContent = "UNLOCKED!";
    progressNumber.textContent = "100%";
    stopTrack(audio.humming, true);
    stopTrack(audio.footsteps, true);
    await safePlay(audio.door, { restart: true });
    await sleep(700);
    await enterSafeRoom();
  }

  async function enterSafeRoom() {
    busy = true;
    setScene("sceneSafe");
    hide(unlockPanel);
    hide(lookBackButton);
    await sleep(1100);
    await say([
      "We're in.",
      "You're safe here.",
      "I don't think she can follow us inside.",
      "This room feels... different.",
      "Maybe we should turn on the light."
    ]);
    show(finalLight);
    busy = false;
  }

  async function revealFinalRoom() {
    if (busy) return;
    busy = true;
    hide(finalLight);
    await safePlay(audio.switch, { restart: true });
    await sleep(420);
    await safePlay(audio.blast, { restart: true });
    stopRadio(true);
    setScene("sceneFinal");
    createConfetti();
    await safePlay(audio.aboutYou, { restart: true });
    localStorage.setItem("maeghanCheckpoint", "final-room");
    busy = false;
  }

  function showFinalEnding() {
    if (!sceneById("sceneFinal").classList.contains("is-active")) return;

    continueFinal.disabled = true;
    finalEnding.setAttribute("aria-hidden", "false");
    sceneById("sceneFinal").classList.add("is-ended");

    window.setTimeout(() => {
      finalCard.hidden = true;
      restartGame.focus();
    }, 650);
  }

  function openMemoryReel() {
    watchFrame.src = "watch.html";
    watchOverlay.hidden = false;
  }

  function closeMemoryReel() {
    watchOverlay.hidden = true;
    watchFrame.src = "about:blank";
  }

  function restart() {
    stopChaseCountdown(true);
    stopAllAudio();
    localStorage.removeItem("maeghanHasKey");
    localStorage.removeItem("maeghanCheckpoint");
    localStorage.removeItem("maeghanFirstHallway");
    sessionStorage.clear();
    window.location.reload();
  }

  function toggleSound() {
    soundEnabled = !soundEnabled;
    soundToggle.textContent = `SOUND: ${soundEnabled ? "ON" : "OFF"}`;
    if (!soundEnabled) {
      stopAllAudio();
      return;
    }

    const activeScene = document.querySelector(".scene.is-active")?.id;
    if (activeScene === "sceneHaunted") safePlay(audio.haunted);
    if (activeScene === "sceneChase" && chasePhase >= 1 && chasePhase < 4) safePlay(audio.humming);
    if (activeScene === "sceneChase" && chasePhase >= 2 && chasePhase < 4) safePlay(audio.footsteps);
    if (activeScene === "sceneChase" && chasePhase === 4) safePlay(audio.jumpscare);
    if (activeScene === "sceneFinal") safePlay(audio.aboutYou);
  }

  startGameButton.addEventListener("click", beginExperience);
  lightSwitchDark.addEventListener("click", turnOnBedroomLight);
  bedroomDoor.addEventListener("click", () => enterHauntedHallway(false));
  returnRoom.addEventListener("click", returnToGiftRoom);
  radioItem.addEventListener("click", toggleRadio);
  keyItem.addEventListener("click", collectKey);
  giftDoor.addEventListener("click", tryGiftDoor);
  lookBackButton.addEventListener("click", lookBack);
  gameOverRestart.addEventListener("click", restart);
  finalLight.addEventListener("click", revealFinalRoom);
  continueFinal.addEventListener("click", showFinalEnding);
  restartGame.addEventListener("click", restart);
  soundToggle.addEventListener("click", toggleSound);
  openWatch?.addEventListener("click", openMemoryReel);
  closeWatch.addEventListener("click", closeMemoryReel);

  holdDoor.addEventListener("pointerdown", beginHold);
  ["pointerup", "pointercancel"].forEach((eventName) => {
    holdDoor.addEventListener(eventName, (event) => {
      if (
        isHolding &&
        !unlocked &&
        (holdPointerId === null || event.pointerId === holdPointerId)
      ) {
        resetHold(false);
      }
    });
  });
  holdDoor.addEventListener("contextmenu", (event) => event.preventDefault());

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && isHolding && !unlocked) resetHold(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !watchOverlay.hidden) closeMemoryReel();
    beginSpaceHold(event);
  });

  document.addEventListener("keyup", (event) => {
    if (
      event.code === "Space" &&
      isHolding &&
      holdPointerId === null &&
      !unlocked
    ) {
      event.preventDefault();
      resetHold(false);
    }
  });

  window.addEventListener("blur", () => {
    if (isHolding && holdPointerId === null && !unlocked) resetHold(false);
  });

  document.querySelectorAll(".room-item[href]").forEach((item) => {
    item.addEventListener("click", () => {
      localStorage.setItem("maeghanCheckpoint", "gift-room");
    });
  });

  updateInventory();
  createConfetti(75);

  if (state.checkpoint === "gift-room") {
    startGameButton.textContent = "RETURN TO THE ROOM";
  } else if (state.checkpoint === "final-room") {
    startGameButton.textContent = "RETURN TO THE SURPRISE";
  }
})();
