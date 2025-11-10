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
    let audioContext, analyser, microphone, scoreAnimationId;
    const SINGING_THRESHOLD = -50; // 歌っていると判定する音量のしきい値(dB)

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
        if (microphone) microphone.disconnect();
        if (audioContext) audioContext.close();
        cancelAnimationFrame(scoreAnimationId);
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
    }

    // --- 曲の読み込みと表示 ---
    async function loadSongs() {
        try {
            const response = await fetch('data/songs.json');
            songs = await response.json();
            displaySongList();
        } catch (error) {
            console.error('Error loading songs:', error);
            songList.innerHTML = '<li>曲の読み込みに失敗しました。</li>';
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
        audioPlayer.src = song.audio;

        try {
            let lyricsData;
            if (song.isLocal) {
                lyricsData = song.lyrics;
            } else {
                const response = await fetch(song.lyrics);
                lyricsData = await response.json();
            }

            lyrics = lyricsData.lyrics;
            resetKaraokeState();
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
    }

    // --- マイクと採点処理 ---
    async function initMicrophone() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            microphone = audioContext.createMediaStreamSource(stream);
            microphone.connect(analyser);
            analyser.fftSize = 256;
            return true;
        } catch (err) {
            console.error('マイクへのアクセスが拒否されました:', err);
            alert('マイクへのアクセスを許可してください。');
            return false;
        }
    }

    function startScoring() {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        function updateScore() {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for(const amplitude of dataArray) {
                sum += amplitude * amplitude;
            }
            const volume = Math.sqrt(sum / dataArray.length);

            // 簡易的な音量判定
            const currentTime = audioPlayer.currentTime;
            const currentLyric = lyrics[currentLyricIndex];
            const nextLyric = lyrics[currentLyricIndex + 1];

            if (currentLyric && currentTime >= currentLyric[0] && (!nextLyric || currentTime < nextLyric[0])) {
                 // 歌うべき区間で声が出ているか
                if (volume > 20) { // このしきい値は調整が必要
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
        const micReady = await initMicrophone();
        if (micReady) {
            startOverlay.classList.add('hidden');
            scoringDisplay.classList.remove('hidden');
            audioPlayer.play();
            startScoring();
        }
    }

    function finishKaraoke() {
        cancelAnimationFrame(scoreAnimationId);
        finalScoreSpan.textContent = score;
        finalScoreView.classList.remove('hidden');
    }

    // --- 歌詞の同期 ---
    function updateLyrics() {
        const currentTime = audioPlayer.currentTime;
        if (lyrics.length === 0) return;

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
        // (省略：前ステップで実装済みのため変更なし)
        const audioFile = audioFileInput.files[0];
        const lyricsFile = lyricsFileInput.files[0];

        if (!audioFile || !lyricsFile) {
            alert('音声ファイルと歌詞ファイルの両方を選択してください。');
            return;
        }

        try {
            const lyricsText = await lyricsFile.text();
            const lyricsData = JSON.parse(lyricsText);

            const newSong = {
                id: `local-song-${Date.now()}`,
                title: lyricsData.songTitle || '無題の曲',
                artist: lyricsData.artist || '不明なアーティスト',
                audio: URL.createObjectURL(audioFile),
                lyrics: lyricsData,
                isLocal: true
            };

            songs.push(newSong);
            displaySongList();
            audioFileInput.value = '';
            lyricsFileInput.value = '';

        } catch (error) {
            console.error('Error adding new song:', error);
            alert('曲の追加中にエラーが発生しました。');
        }
    }

    // --- イベントリスナー ---
    audioPlayer.addEventListener('timeupdate', updateLyrics);
    audioPlayer.addEventListener('ended', finishKaraoke);
    backButton.addEventListener('click', showSongSelectionView);
    addSongButton.addEventListener('click', addNewSong);
    startSingingButton.addEventListener('click', startSinging);
    retryButton.addEventListener('click', () => {
        finalScoreView.classList.add('hidden');
        resetKaraokeState();
        startOverlay.classList.remove('hidden');
        audioPlayer.currentTime = 0;
    });

    // --- 初期化 ---
    loadSongs();
});
