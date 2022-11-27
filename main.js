const readline = require("readline");
const ffmpeg = require("fluent-ffmpeg");
const data = {
    in_location: "C:/Users/kazun/RAM.avi",
    out_location: "C:/Users/kazun/OneDrive/Videos/"
};
const questions = text => {
    const interface = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve, reject) => {
        interface.question(text, answer => { resolve(answer); interface.close(); });
    });
};
const time = (sec) => {
    let output = "";
    let hour = (sec / 60 / 60).toFixed();
    for (let i = 0; hour > 59; i++) hour -= 60;
    let minute = (sec / 60).toFixed();
    for (let i = 0; minute > 59; i++) minute -= 60;
    let second = sec.toFixed();
    for (let i = 0; second > 59; i++) second -= 60;
    if (hour != 0) output += hour + "時間";
    if (minute != 0) output += minute + "分";
    if (second != 0) output += second + "秒";
    return output;
};
const mb = (byte) => { return (byte / 1024 / 1024).toFixed(1); };
const start = async () => {
    console.info("変換元は" + data.in_location + "です。\n変換先は" + data.out_location + "です。");
    console.info("上記のパスは、プロクラムを書き換えることで変更することが出来ます。");
    console.info(
        "[1] FFmpegで変換を始める (簡単)\n" + 
        "[2] パスを指定してFFmpegで変換を始める (普通)\n" +
        "[3] FFmpegのタグを自分で入力し、パスを指定して変換を始める (上級)\n" +
        "[4] デフォルトのパスを変更する ※現在は使用出来ない機能です。\n" +
        "[5] プリセットを追加・削除する ※現在は使用出来ない機能です。"
    );
    const selectcmd = Number(await questions("実行するプログラムを選択してください。> "));
    switch (selectcmd) {
        case 1: {
            const filename = await questions("ファイル名を入力してください。> ");
            presetselect({inloca:data.in_location, outloca:data.out_location, name:filename});
            break;
        }
        case 2: {
            const in_location = await questions("変換元の動画パスを入力してください。> ");
            const out_location = await questions("変換先のパスを入力してください。 > ");
            const filename = await questions("ファイル名を入力してください。> ");
            presetselect({inloca:in_location, outloca:out_location, name:filename});
            break;
        }
        case 3: {
            const in_location = await questions("変換元の動画パスを入力してください。> ");
            const out_location = await questions("変換先のパスを入力してください。 > ");
            const filename = await questions("ファイル名を入力してください。> ");
            let tag = [];
            outs:while (true) {
                console.info("現在の入力済みタグ数は" + tag.length + "です。\n空欄で続行するとタグの入力が完了したことになります。");
                const input = await questions("タグを入力してください。> ");
                if (input == "") break outs;
                tag.push(input);
                continue;
            }
            convert({inloca:in_location, outloca:out_location, name:filename}, tag);
            break;
        }
    };
};
const presetselect = async data => {
    console.info(
        "コマンド一覧:\n" +
        "[1] 高速、サイズ大 (h264 + キーフレーム1 + プリセット最速)\n" +
        "[2] 高速、サイズ小 (h264 + そしてキーフレーム120 + プリセット最速)\n" +
        "[3] 低速、サイズ中 (h264 + そしてキーフレーム1 + プリセット通常)\n" +
        "[4] 低速、サイズ極小 (h264 + そしてキーフレーム120 + プリセット通常)\n" +
        "[5] 超低速、サイズ最小 (h265 + そしてキーフレーム1 + プリセット通常)\n"
    );
    let preset;
    const selectopt = Number(await questions("変換するプリセットを選択してください。> "));
    if (!selectopt || selectopt > 4) { console.error("入力された値が不明であったため、操作を中断します。"); process.exit() };
    switch (selectopt) {
        case 1: preset = ["-c:v libx264", "-c:a aac", "-tag:v avc1", "-pix_fmt yuv420p", "-preset ultrafast", "-tune fastdecode,zerolatency", "-movflags +faststart", "-crf 21", "-g 1"]; break;
        case 2: preset = ["-c:v libx264", "-c:a aac", "-tag:v avc1", "-pix_fmt yuv420p", "-preset ultrafast", "-movflags +faststart", "-crf 21", "-g 120"]; break;
        case 3: preset = ["-c:v libx264", "-c:a aac", "-tag:v avc1", "-pix_fmt yuv420p", "-tune fastdecode,zerolatency", "-movflags +faststart", "-crf 21", "-g 1"]; break;
        case 4: preset = ["-c:v libx264", "-c:a aac", "-tag:v avc1", "-pix_fmt yuv420p", "-movflags +faststart", "-crf 21", "-g 120"]; break;
        case 5: preset = ["-c:v libx265", "-c:a aac", "-tag:v hvc1", "-pix_fmt yuv420p", "-movflags +faststart", "-crf 21", "-g 120"]; break;
    };
    convert(data, preset);
};
const convert = async (data, preset) => {
    const {inloca, outloca, name} = data;
    const prog = ffmpeg(inloca);
    prog.addOptions(preset);
    prog.save(outloca + name + ".mp4");
    prog.on("start", async commandLine => { starttime = Date.now(); console.log("変換を開始します。" + commandLine); });
    prog.on("progress", async progress => {
        const downloadedSeconds = (Date.now() - starttime) / 1000;
        let percent = time(downloadedSeconds / progress.percent - downloadedSeconds);
        if (!progress.percent) percent = "利用不可";
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(progress.frames + "フレーム処理しました。(" + progress.currentFps + " fps) " + time(downloadedSeconds) + "経過 推定残り時間: " + percent);
        readline.moveCursor(process.stdout, 0, 0);
    })
    prog.on("end", () => {
        console.info("動画の変換が完了しました。");
    });
};
start();