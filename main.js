const readline = require("readline");
const fs = require("fs");
const http = require("http");
const ffmpeg = require("fluent-ffmpeg");
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
    const req = http.request("http://localhost", {
        port: 3000,
        method: "post",
        headers: { "Content-Type": "text/plain;charset=utf-8" }
    });
    req.on("response", res => {
        let data = "";
        res.on("data", chunk => { data += chunk; });
        res.on("end", async () => {
            const json = JSON.parse(data);
            console.info("変換元は" + json.in_location + "です。\n変換先は" + json.out_location + "です。");
            console.info("上記のパスは、プロクラムを書き換えることで変更することが出来ます。");
            console.info(
                "[1] FFmpegで変換を始める (簡単)\n" +
                "[2] パスを指定してFFmpegで変換を始める (普通)\n" +
                "[3] FFmpegのタグを自分で入力し、パスを指定して変換を始める (上級)\n" +
                "[4] デフォルトのパスを変更する\n" +
                "[5] プリセットを追加・削除する ※現在は使用出来ない機能です。"
            );
            const selectcmd = Number(await questions("実行するプログラムを選択してください。> "));
            if (!selectcmd || selectcmd > 5) { console.error("入力された値が不明であったため、操作を中断します。"); process.exit() };
            switch (selectcmd) {
                case 1: {
                    const filename = await questions("ファイル名を入力してください。> ");
                    presetselect({ inloca: json.in_location, outloca: json.out_location, name: filename });
                    break;
                }
                case 2: {
                    const in_location = await questions("変換元の動画パスを入力してください。> ");
                    const out_location = await questions("変換先のパスを入力してください。 > ");
                    const filename = await questions("ファイル名を入力してください。> ");
                    presetselect({ inloca: in_location, outloca: out_location, name: filename });
                    break;
                }
                case 3: {
                    const in_location = await questions("変換元の動画パスを入力してください。> ");
                    const out_location = await questions("変換先のパスを入力してください。 > ");
                    const filename = await questions("ファイル名を入力してください。> ");
                    let tag = [];
                    outs: while (true) {
                        console.info("現在の入力済みタグ数は" + tag.length + "です。\n空欄で続行するとタグの入力が完了したことになります。");
                        const input = await questions("タグを入力してください。> ");
                        if (input == "") break outs;
                        tag.push(input);
                        continue;
                    }
                    convert({ inloca: in_location, outloca: out_location, name: filename }, tag);
                    break;
                }
                case 4: {
                    console.info("パスを変更します。\n空欄で続行すると、スキップされます。\n元の変換元: " + json.in_location + "\n元の変換先: " + json.out_location)
                    const in_location = await questions("変換元の動画パスを入力してください。> ");
                    if (in_location) json.in_location = in_location;
                    const out_location = await questions("変換先のパスを入力してください。 > ");
                    if (out_location) json.out_location = out_location;const req = http.request("http://localhost", {
                        port: 3000,
                        method: "post",
                        headers: { "Content-Type": "text/plain;charset=utf-8" }
                    });
                    req.write(JSON.stringify(["youtube_downloader", json]));
                    req.on("error", err => console.log());
                    req.end();
                }
                case 5: {
                }
            };
        });
    });
    req.write(JSON.stringify(["youtube_downloader"]));
    req.on("error", err => console.log());
    req.end();
};
const presetselect = async data => {
    const req = http.request("http://localhost", {
        port: 3000,
        method: "post",
        headers: { "Content-Type": "text/plain;charset=utf-8" }
    });
    req.on("response", res => {
        let data = "";
        res.on("data", chunk => { data += chunk; });
        res.on("end", async () => {
            const json = JSON.parse(data);
            let list = "";
            for (let i = 0; i != json.presets.length; i++) {
                list += "[" + (i + 1) + "] " + json.presets[i].display + "\n";
            };
            console.info("コマンド一覧:\n" + list);
            let preset;
            const selectopt = Number(await questions("変換するプリセットを選択してください。> "));
            if (!selectopt || selectopt > (json.presets.length)) { console.error("入力された値が不明であったため、操作を中断します。"); process.exit() };
            convert(data, json.presets[selectopt - 1].tags);
        });
    });
    req.write(JSON.stringify(["youtube_downloader"]));
    req.on("error", err => console.log());
    req.end();
};
const convert = async (data, preset) => {
    const { inloca, outloca, name } = data;
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