const { FFmpeg } = FFmpegWASM;
const { fetchFile } = FFmpegUtil;

let ffmpeg = null;
let selectedFile = null;

// Элементы DOM
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const processBtn = document.getElementById('processBtn');
const statusArea = document.getElementById('statusArea');
const progressBar = document.getElementById('progressBar');
const statusText = document.getElementById('statusText');
const resultArea = document.getElementById('resultArea');
const downloadLink = document.getElementById('downloadLink');

// Инициализация FFmpeg
async function initFFmpeg() {
    if (ffmpeg) return;
    
    ffmpeg = new FFmpeg();
    
    // Обработчик прогресса
    ffmpeg.on('progress', ({ progress, time }) => {
        const percent = Math.min(Math.round(progress * 100), 100);
        progressBar.style.width = `${percent}%`;
        statusText.textContent = `Обработка: ${percent}%`;
    });

    ffmpeg.on('log', ({ message }) => {
        console.log(message); // Для отладки в консоли браузера
    });

    statusArea.classList.remove('hidden');
    statusText.textContent = 'Загрузка движка обработки (около 30 МБ)...';
    
    try {
        // Загрузка ядра WASM
        await ffmpeg.load({
            coreURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js",
            wasmURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm"
        });
        statusText.textContent = 'Движок готов. Выберите видео.';
        setTimeout(() => statusArea.classList.add('hidden'), 2000);
    } catch (err) {
        statusText.textContent = 'Ошибка загрузки движка. Обновите страницу.';
        console.error(err);
    }
}

// Выбор файла
dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

// Drag & Drop (для десктопа, если откроют)
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
    }
});

function handleFile(file) {
    selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = (file.size / (1024 * 1024)).toFixed(2) + ' МБ';
    fileInfo.classList.remove('hidden');
    processBtn.classList.remove('hidden');
    processBtn.disabled = false;
    resultArea.classList.add('hidden');
}

// Запуск обработки
processBtn.addEventListener('click', async () => {
    if (!selectedFile || !ffmpeg) return;

    processBtn.disabled = true;
    statusArea.classList.remove('hidden');
    resultArea.classList.add('hidden');
    progressBar.style.width = '0%';
    statusText.textContent = 'Чтение файла в память...';

    try {
        const inputName = 'input.mp4';
        const outputName = 'output.mp4';

        // Записываем файл в виртуальную файловую систему WASM
        await ffmpeg.writeFile(inputName, await fetchFile(selectedFile));

        statusText.textContent = 'Кодирование видео (это может занять время)...';

        // Команда FFmpeg для идеального TikTok
        // 1080x1920, H.264 High Profile, 60 FPS, Битрейт 20M, AAC 256k
        await ffmpeg.exec([
            '-i', inputName,
            '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=60',
            '-c:v', 'libx264',
            '-profile:v', 'high',
            '-level', '4.2',
            '-preset', 'fast', // fast для мобильных устройств, чтобы не зависало
            '-b:v', '20M',
            '-maxrate', '22M',
            '-bufsize', '40M',
            '-c:a', 'aac',
            '-b:a', '256k',
            '-ar', '48000',
            '-movflags', '+faststart',
            '-pix_fmt', 'yuv420p',
            outputName
        ]);

        statusText.textContent = 'Сохранение результата...';

        // Читаем результат
        const data = await ffmpeg.readFile(outputName);
        
        // Создаем ссылку для скачивания
        const blob = new Blob([data.buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        
        downloadLink.href = url;
        statusArea.classList.add('hidden');
        resultArea.classList.remove('hidden');
        processBtn.disabled = false;

        // Очистка памяти
        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);

    } catch (err) {
        console.error(err);
        statusText.textContent = 'Ошибка при обработке. Возможно, не хватило памяти устройства.';
        processBtn.disabled = false;
    }
});

// Инициализируем при загрузке страницы
window.onload = () => {
    initFFmpeg();
};
