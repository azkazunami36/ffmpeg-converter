const readline = require("readline");
const fs = require("fs");
const http = require("http");
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
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
    let minute = 0;
    let hour = 0;
    for (minute; sec > 59; minute++) sec -= 60;
    for (hour; minute > 59; hour++) minute -= 60;
    if (hour != 0) output += hour + "時間";
    if (minute != 0) output += minute + "分";
    output += (sec).toFixed() + "秒";
    return output;
};
const video_extensions = [
    "mp4", "mov", "mkv", "avi"
];
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
                "[5] プリセットを追加・削除する ※現在は使用出来ない機能です。\n" +
                "[6] 変換元を指定して、プリセットを使用し一括変換する。"
            );
            const selectcmd = Number(await questions("実行するプログラムを選択してください。> "));
            if (!selectcmd || selectcmd > 6) { console.error("入力された値が不明であったため、操作を中断します。"); process.exit() };
            switch (selectcmd) {
                case 1: {
                    const filename = await questions("ファイル名を入力してください。> ");
                    const presets = await presetselect(json.presets);
                    convert({ inloca: json.in_location, outloca: json.out_location, name: filename }, presets);
                    break;
                }
                case 2: {
                    const in_location = await questions("変換元の動画パスを入力してください。> ");
                    const out_location = await questions("変換先のパスを入力してください。 > ");
                    const filename = await questions("ファイル名を入力してください。> ");
                    const presets = await presetselect(json.presets);
                    convert({ inloca: in_location, outloca: out_location, name: filename }, presets);
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
                    if (out_location) json.out_location = out_location; const req = http.request("http://localhost", {
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
                case 6: {
                    let ext = "";
                    for (let i = 0; i != video_extensions.length; i++) {
                        ext += video_extensions[i];
                        if (video_extensions.length != (i + 1)) ext += ", ";
                    };
                    console.info(
                        "パスはフォルダである必要があり、\n" +
                        "拡張子は[" + ext + "]の" + video_extensions.length + "つとなっています。"
                    );
                    const in_location = await questions("変換元のパスを入力してください。> ");
                    const { extensions, filenamelist } = await filelistget(in_location);
                    const out_location = await questions("変換先のパスを入力してください。 > ");
                    const presets = await presetselect(json.presets);
                    console.info(
                        "準備が整いました。以下を確認してください。\n" +
                        "変換元: " + in_location + "\n" +
                        "変換先: " + out_location + "\n" +
                        "変換元の動画本数: " + filenamelist.length + "本"
                    );
                    const premission = await questions("変換を開始しますか？yで続行します。 > ");
                    if (premission != "y") return;
                    for (let i = 0; i != filenamelist.length; i++) {
                        let missing = "";
                        if (i != 0) {
                            missing = "\nただいま進行状況が表示されていないかもしれません...\n" +
                                "申し訳ありませんが、しばらくお待ちください...";
                        };
                        console.info((i + 1) + "本目の動画を変換しています...\nファイル名: " + filenamelist[i] + missing);
                        await convert({ inloca: in_location + filenamelist[i] + "." + extensions[i], outloca: out_location, name: filenamelist[i] }, presets);
                    };
                    console.info("全ての動画、" + filenamelist.length + "本の変換が完了しました！");
                }
            };
        });
    });
    req.write(JSON.stringify(["youtube_downloader"]));
    req.on("error", err => console.log());
    req.end();
};
const presetselect = async presets => {
    let list = "";
    for (let i = 0; i != presets.length; i++) {
        list += "[" + (i + 1) + "] " + presets[i].display + "\n";
    };
    console.info("コマンド一覧:\n" + list);
    const selectopt = Number(await questions("変換するプリセットを選択してください。> "));
    if (!selectopt || selectopt > (presets.length)) {
        console.error("入力された値が不明であったため、操作を中断します。");
        process.exit();
    };
    return presets[selectopt - 1].tags;
};
const convert = async (data, preset) => {
    const { inloca, outloca, name } = data;
    const prog = ffmpeg(inloca);
    await new Promise((resolve) => {
        const progress = async (progress) => {
            const downloadedSeconds = (Date.now() - starttime) / 1000;
            let percent = time(downloadedSeconds / progress.percent - downloadedSeconds);
            if (!progress.percent) percent = "利用不可";
            readline.cursorTo(process.stdout, 0);
            process.stdout.write(progress.frames + "フレーム処理しました。(" + progress.currentFps + " fps) " + time(downloadedSeconds) + "経過 推定残り時間: " + percent);
            readline.moveCursor(process.stdout, 0, 0);
        };
        prog.addOptions(preset);
        prog.save(outloca + name + ".mp4");
        prog.on("start", async commandLine => { starttime = Date.now(); console.info("変換を開始します。" + commandLine); });
        prog.on("progress", progress)
        prog.on("end", () => {
            console.info("動画の変換が完了しました。");
            resolve();
        });
    });
};
const filelistget = folder_path => {
    return new Promise((resolve, reject) => {
        fs.readdir(folder_path, { withFileTypes: true }, (err, dirents) => {
            if (err) reject(err);
            const extensions = [];
            const filenamelist = [];
            for (let i = 0; i != dirents.length; i++) {
                const dirent = dirents[i];
                const fp = path.join(folder_path, dirent.name);
                if (!dirent.isDirectory()) {
                    const namedot = dirent.name.split(".");
                    const extension = namedot[namedot.length - 1];
                    for (let i = 0; i != video_extensions.length; i++) {
                        if (video_extensions[i] == extension) {
                            filenamelist.push(dirent.name.slice(0, -(extension.length + 1)));
                            extensions.push(extension);
                        };
                    };
                };
            };
            resolve({ extensions: extensions, filenamelist: filenamelist });
        });
    });
};
start();