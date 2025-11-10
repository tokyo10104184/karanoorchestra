// DOM要素の取得
const lyricsContainer = document.getElementById('lyrics-container');
const audioPlayer = document.getElementById('audio-player');

let lyrics = [];
let currentLyricIndex = 0;

// 歌詞データの読み込み
fetch('data/lyrics.json')
    .then(response => response.json())
    .then(data => {
        lyrics = data.lyrics;
        document.querySelector('h1').textContent = data.songTitle + " - " + data.artist;
        lyricsContainer.textContent = lyrics[0][1];
    })
    .catch(error => console.error('Error loading lyrics:', error));


// オーディオの再生時間に合わせて歌詞を更新するイベントリスナー
audioPlayer.addEventListener('timeupdate', () => {
    const currentTime = audioPlayer.currentTime;

    if (lyrics.length === 0) return;

    // 次の歌詞のタイムスタンプを確認し、現在の再生時間がそれを超えていたらインデックスを更新
    if (currentLyricIndex < lyrics.length - 1 && currentTime >= lyrics[currentLyricIndex + 1][0]) {
        currentLyricIndex++;
        lyricsContainer.textContent = lyrics[currentLyricIndex][1];
    }

    // 曲の冒頭などで再生位置が戻った場合に対応
    if (currentLyricIndex > 0 && currentTime < lyrics[currentLyricIndex][0]) {
        currentLyricIndex--;
        lyricsContainer.textContent = lyrics[currentLyricIndex][1];
    }
});

// ページの読み込み時に音声ファイルを設定
window.onload = () => {
    audioPlayer.src = "data/sample.mp3";
};
