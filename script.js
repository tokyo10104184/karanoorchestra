document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素の取得 ---
    const songSelectionView = document.getElementById('song-selection-view');
    const karaokeView = document.getElementById('karaoke-view');
    const songList = document.getElementById('song-list');
    const songTitle = document.getElementById('song-title');
    const lyricsContainer = document.getElementById('lyrics-container');
    const audioPlayer = document.getElementById('audio-player');
    const backButton = document.getElementById('back-button');
    const audioFileInput = document.getElementById('audio-file-input');
    const lyricsFileInput = document.getElementById('lyrics-file-input');
    const addSongButton = document.getElementById('add-song-button');
    const startOverlay = document.getElementById('start-overlay');
    const startSingingButton = document.getElementById('start-singing-button');
    const scoringDisplay = document.getElementById('scoring-display');
    const currentScoreSpan = document.getElementById('current-score');
    const finalScoreView = document.getElementById('final-score-view');
    const finalScoreSpan = document.getElementById('final-score');
    const retryButton = document.getElementById('retry-button');

    // --- 変数定義 ---
    let lyrics = [];
    let currentLyricIndex = 0;
    let songs = [];
    let currentSong = null;
    let score = 0;
    let micAudioContext, analyser, microphone, scoreAnimationId;
    let synthAudioContext, synthGain;
    let pseudoCurrentTime = 0;
    let animationFrameId;

    const NOTE_FREQUENCIES = {
        'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23,
        'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
    };

    // --- ビューの切り替え ---
    function showKaraokeView() {
        songSelectionView.classList.add('hidden');
        karaokeView.classList.remove('hidden');
        startOverlay.classList.remove('hidden');
        finalScoreView.classList.add('hidden');
        scoringDisplay.classList.add('hidden');
    }

    function showSongSelectionView() {
        karaokeView.classList.add('hidden');
        songSelectionView.classList.remove('hidden');
        stopAllAudio();
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
    }

    function stopAllAudio() {
        if (microphone) microphone.disconnect();
        if (micAudioContext) micAudioContext.close();
        if (synthAudioContext) synthAudioContext.close();
        cancelAnimationFrame(scoreAnimationId);
        cancelAnimationFrame(animationFrameId);
    }

    // --- 曲の読み込みと表示 ---
    async function loadSongs() {
        try {
            const response = await fetch('data/songs.json');
            songs = await response.json();
            displaySongList();
        } catch (error) {
            console.error('Error loading songs:', error);
        }
    }

    function displaySongList() {
        songList.innerHTML = '';
        songs.forEach(song => {
            const li = document.createElement('li');
            li.textContent = `${song.title} - ${song.artist}`;
            li.addEventListener('click', () => prepareKaraoke(song));
            songList.appendChild(li);
        });
    }

    // --- カラオケの準備 ---
    async function prepareKaraoke(song) {
        currentSong = song;
        songTitle.textContent = `${song.title} - ${song.artist}`;

        try {
            let lyricsDataPath = song.isLocal ? null : song.lyrics_path;
            if(song.isLocal){
                 lyrics = song.lyrics.lyrics;
            } else {
                 const response = await fetch(lyricsDataPath);
                 const data = await response.json();
                 lyrics = data.lyrics;
            }

            resetKaraokeState();

            if (song.type === 'webaudio') {
                audioPlayer.classList.add('hidden');
            } else {
                audioPlayer.src = song.audio;
                audioPlayer.classList.remove('hidden');
            }
            showKaraokeView();

        } catch (error) {
            console.error('Error loading lyrics:', error);
            alert('歌詞の読み込みに失敗しました。');
        }
    }

    function resetKaraokeState() {
        currentLyricIndex = 0;
        lyricsContainer.textContent = lyrics.length > 0 ? lyrics[0][1] : '歌詞がありません';
        score = 0;
        currentScoreSpan.textContent = score;
        pseudoCurrentTime = 0;
    }

    // --- Web Audio メロディ再生 ---
    function playMelody(song) {
        synthAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = synthAudioContext.createOscillator();
        synthGain = synthAudioContext.createGain();

        oscillator.type = 'sine'; // 波形をサイン波に変更して柔らかい音色に
        oscillator.connect(synthGain);
        synthGain.connect(synthAudioContext.destination);

        const beatDuration = 60 / song.tempo;
        let audioCurrentTime = synthAudioContext.currentTime;
        let pseudoPlayTime = 0;

        song.melody.forEach(([note, length]) => {
            const duration = beatDuration * (4 / length); // 4分音符を基準にする
            if (NOTE_FREQUENCIES[note]) {
                const attackTime = 0.01;
                const releaseTime = 0.1;
                const peakVolume = 0.2;

                synthGain.gain.setValueAtTime(0, audioCurrentTime);
                // Attack: 短い時間で音量を上げる
                synthGain.gain.linearRampToValueAtTime(peakVolume, audioCurrentTime + attackTime);
                oscillator.frequency.setValueAtTime(NOTE_FREQUENCIES[note], audioCurrentTime);

                // Release: 音が終わる少し前から音量を下げ始める
                synthGain.gain.setValueAtTime(peakVolume, audioCurrentTime + duration - releaseTime);
                synthGain.gain.linearRampToValueAtTime(0, audioCurrentTime + duration);
            }
            audioCurrentTime += duration;
            pseudoPlayTime += duration;
        });

        oscillator.start();
        oscillator.stop(audioCurrentTime); // 全ての音符が終わったら停止

        // 歌詞同期のための擬似的な時間更新 (requestAnimationFrameを使用)
        const totalDuration = pseudoPlayTime;
        const startTime = Date.now();

        function animationLoop() {
            pseudoCurrentTime = (Date.now() - startTime) / 1000;
            updateLyrics(pseudoCurrentTime);

            if (pseudoCurrentTime < totalDuration) {
                animationFrameId = requestAnimationFrame(animationLoop);
            } else {
                finishKaraoke();
            }
        }
        animationLoop();
    }

    // --- マイクと採点処理 ---
    async function initMicrophone() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micAudioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = micAudioContext.createAnalyser();
            microphone = micAudioContext.createMediaStreamSource(stream);
            microphone.connect(analyser);
            return true;
        } catch (err) {
            alert('マイクへのアクセスを許可してください。');
            return false;
        }
    }

    function startScoring() {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        function updateScore() {
            analyser.getByteFrequencyData(dataArray);
            const volume = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;

            const time = currentSong.type === 'webaudio' ? pseudoCurrentTime : audioPlayer.currentTime;
            const currentLyric = lyrics[currentLyricIndex];
            const nextLyric = lyrics[currentLyricIndex + 1];

            if (currentLyric && time >= currentLyric[0] && (!nextLyric || time < nextLyric[0])) {
                if (volume > 30) {
                    score += 1;
                    currentScoreSpan.textContent = score;
                }
            }
            scoreAnimationId = requestAnimationFrame(updateScore);
        }
        updateScore();
    }

    // --- カラオケの開始と終了 ---
    async function startSinging() {
        startOverlay.classList.add('hidden');
        scoringDisplay.classList.remove('hidden');

        if (currentSong.type === 'webaudio') {
            playMelody(currentSong);
        } else {
            audioPlayer.play();
        }

        const micReady = await initMicrophone();
        if (micReady) startScoring();
    }

    function finishKaraoke() {
        stopAllAudio();
        finalScoreSpan.textContent = score;
        finalScoreView.classList.remove('hidden');
    }

    // --- 歌詞の同期 ---
    function updateLyrics(timeOverride) {
        const currentTime = timeOverride !== undefined ? timeOverride : audioPlayer.currentTime;
        if (!lyrics || lyrics.length === 0) return;

        if (currentLyricIndex < lyrics.length - 1 && currentTime >= lyrics[currentLyricIndex + 1][0]) {
            currentLyricIndex++;
            lyricsContainer.textContent = lyrics[currentLyricIndex][1];
        }
        while (currentLyricIndex > 0 && currentTime < lyrics[currentLyricIndex][0]) {
            currentLyricIndex--;
            lyricsContainer.textContent = lyrics[currentLyricIndex][1];
        }
    }

    // --- 曲の追加 ---
    async function addNewSong() {
        const audioFile = audioFileInput.files[0];
        const lyricsFile = lyricsFileInput.files[0];
        if (!audioFile || !lyricsFile) return;

        try {
            const lyricsText = await lyricsFile.text();
            const lyricsData = JSON.parse(lyricsText);
            const newSong = {
                id: `local-song-${Date.now()}`,
                title: lyricsData.songTitle || '無題の曲',
                artist: lyricsData.artist || '不明なアーティスト',
                audio: URL.createObjectURL(audioFile),
                lyrics: lyricsData,
                isLocal: true,
                type: 'file'
            };
            songs.push(newSong);
            displaySongList();
        } catch (error) {
            alert('曲の追加中にエラーが発生しました。');
        }
    }

    // --- イベントリスナー ---
    audioPlayer.addEventListener('timeupdate', () => updateLyrics());
    audioPlayer.addEventListener('ended', finishKaraoke);
    backButton.addEventListener('click', showSongSelectionView);
    addSongButton.addEventListener('click', addNewSong);
    startSingingButton.addEventListener('click', startSinging);
    retryButton.addEventListener('click', () => {
        finalScoreView.classList.add('hidden');
        resetKaraokeState();
        startOverlay.classList.remove('hidden');
        if (currentSong.type !== 'webaudio') {
            audioPlayer.currentTime = 0;
        }
    });

    // --- 初期化 ---
    loadSongs();
});
