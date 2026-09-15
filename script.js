const { FFmpeg } = FFmpegWASM;
const { fetchFile } = FFmpegUtil;

let ffmpeg = null;
let selectedFile = null;

const engineStatus = document.getElementById('engineStatus');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileNameEl = document.getElementById('fileName');
const fileSizeEl = document.getElementById('fileSize');
const processBtn = document.getElementById('processBtn');
const progressArea = document.getElementById('progressArea');
const progressBar = document.getElementById('progressBar');
const statusText = document.getElementById('statusText');
const resultArea = document.getElementById('resultArea');
const downloadLink = document.getElementById('downloadLink');
const errorArea = document.getElementById('errorArea');

// 1. Инициализация движка с защитой от зависания
async function initEngine() {
    try {
        ffmpeg = new FFmpeg();
        
        ffmpeg.on('progress', ({ progress }) => {
            const pct = Math.min(Math.round(progress * 100), 100);
            progressBar.style.width = `${pct}%`;
            statusText.textContent = `Патчинг: ${pct}% (не сворачивайте браузер)`;
        });

        // Загружаем ядро
        await ffmpeg.load({
            coreURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js",
            wasmURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm"
        });

        // Движок готов
        engineStatus.classList.remove('loading');
        engineStatus.classList.add('ready');
        engineStatus.innerHTML = 'Движок готов';
        
        // Разблокируем кнопку загрузки
        document.getElementById('uploadLabel').style.pointerEvents = 'auto';
        document.getElementById('uploadLabel').style.opacity = '1';

    } catch (err) {
        console.error(err);
        engineStatus.innerHTML = 'Ошибка загрузки. Обновите страницу.';
        engineStatus.style.background = 'rgba(254, 44, 85, 0.2)';
        engineStatus.style.color = '#fe2c55';
    }
}

// Блокируем выбор файла, пока движок не загрузился
document.getElementById('uploadLabel').style.pointerEvents = 'none';
document.getElementById('uploadLabel').style.opacity = '0.5';

// 2. Выбор файла
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Защита от зависания: лимит 500 МБ
    if (file.size > 500 * 1024 * 1024) {
        alert("Файл слишком большой! iPhone зависнет. Выберите видео до 500 МБ.");
        return;
    }

    selectedFile = file;
    fileNameEl.textContent = file.name.length > 25 ? file.name.substring(0, 22) + '...' : file.name;
    fileSizeEl.textContent = (file.size / (1024 * 1024)).toFixed(1) + ' МБ';
    
    fileInfo.classList.remove('hidden');
    processBtn.classList.remove('hidden');
    processBtn.disabled = false;
    resultArea.classList.add('hidden');
    errorArea.classList.add('hidden');
});

// 3. Обработка
processBtn.addEventListener('click', async () => {
    if (!selectedFile || !ffmpeg) return;

    // Блокируем интерфейс
    processBtn.disabled = true;
    processBtn.classList.add('hidden');
    progressArea.classList.remove('hidden');
    resultArea.classList.add('hidden');
    errorArea.classList.add('hidden');
    progressBar.style.width = '0%';
    statusText.textContent = 'Чтение файла в память...';

    try {
        const inputName = 'in.mp4';
        const outputName = 'out.mp4';

        // Пишем файл
        await ffmpeg.writeFile(inputName, await fetchFile(selectedFile));

        statusText.textContent = 'Применение патча (не сворачивайте)...';

        // КОМАНДА ПАТЧА:
        // ultrafast - спасает iPhone от зависания
        // threads 4 - использует все ядра телефона
        // fps=60, scale=1080:1920 - идеальные параметры
        await ffmpeg.exec([
            '-i', inputName,
            '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=60',
            '-c:v', 'libx264',
            '-profile:v', 'high',
            '-level', '4.2',
            '-preset', 'ultrafast', // <-- ГЛАВНОЕ ИЗМЕНЕНИЕ ОТ ЗАВИСАНИЙ
            '-tune', 'zerolatency',
            '-threads', '4',        // <-- УСКОРЯЕТ В РАЗЫ НА ТЕЛЕФОНЕ
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

        statusText.textContent = 'Упаковка...';

        // Читаем результат
        const data = await ffmpeg.readFile(outputName);
        const blob = new Blob([data.buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        
        downloadLink.href = url;
        progressArea.classList.add('hidden');
        resultArea.classList.remove('hidden');

        // Очищаем память, чтобы телефон не крашнулся
        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);
        
        // Возвращаем кнопку
        processBtn.classList.remove('hidden');
        processBtn.disabled = false;

    } catch (err) {
        console.error(err);
        progressArea.classList.add('hidden');
        errorArea.classList.remove('hidden');
        processBtn.classList.remove('hidden');
        processBtn.disabled = false;
    }
});

// Старт
window.onload = initEngine;
