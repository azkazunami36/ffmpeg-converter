const readline = require("readline");
const fs = require("fs");
const http = require("http");
const ffmpeg = require("fluent-ffmpeg");
/**
 * 動画の自動検出の際、この中から対象にする拡張子を追加する。
 */
const video_extensions = ["mp4", "mov", "mkv", "avi", "m4v"];
/**
 * ユーザーからの文字入力を受けつける。
 * @param {string} text 
 * @returns 入力された文字列を返答する。
 */
const questions = text => {
    const interface = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => interface.question(text, answer => { resolve(answer); interface.close(); }));
};
/**
 * 秒数を日本語型でのカウントに変換する。
 * @param {number} sec 
 * @returns 変換された文字列を返答する。
 */
const time = (sec) => {
    let output = "";
    let minute = 0;
    let hour = 0;
    for (minute; sec > 59; minute++) sec -= 60;
    for (hour; minute > 59; hour++) minute -= 60;
    if (hour != 0) output += hour + "時間";
    if (minute != 0) output += minute + "分";
    output += sec.toFixed() + "秒";
    return output;
};
/**
 * jsonに保管されたプリセットを画面に表示し、  
 * ユーザーに選択させる。
 * @param {Array} presets jsonデータを入力する。
 * @returns 選択されたタグ(プリセット)を出力する。
 */
const presetselect = async presets => {
    let list = "";
    for (let i = 0; i != presets.length; i++) {
        list += "[" + (i + 1) + "] " + presets[i].display + "\n";
    };
    console.info("コマンド一覧:\n" + list);
    const selectopt = Number(await questions("変換するプリセットを選択してください。> "));
    if (!selectopt || selectopt > (presets.length)) syspend();
    return presets[selectopt - 1].tags;
};
/**
 * FFmpegを使用して変換する。
 * @param {Dictionary} data 変換元、変換先やファイル名を入力する。
 * @param {Array} preset タグ(プリセット)を入力する。
 */
const convert = async (data, preset) => {
    const { inloca, outloca, name } = data;
    let starttime;
    const prog = ffmpeg(inloca);
    await new Promise(resolve => {
        const progress = async (progress) => {
            const downloadedSeconds = (Date.now() - starttime) / 1000;
            let percent = time(downloadedSeconds / progress.percent - downloadedSeconds);
            if (!progress.percent) percent = "利用不可";
            readline.cursorTo(process.stdout, 0);
            readline.clearLine(process.stdout);
            process.stdout.write(progress.frames + "フレーム処理しました。(" + progress.currentFps + " fps) " + time(downloadedSeconds) + "経過 推定残り時間: " + percent);
            readline.moveCursor(process.stdout, 0, 0);
        };
        prog.addOptions(preset);
        prog.save(outloca + name + ".mp4");
        prog.on("start", async commandLine => { starttime = Date.now(); console.info("変換を開始します。" + commandLine); });
        prog.on("progress", progress);
        prog.on("end", () => {
            readline.clearLine(process.stdout);
            readline.cursorTo(process.stdout, 0);
            console.info("動画の変換が完了しました。処理時間:" + time((Date.now() - starttime) / 1000));
            resolve();
        });
    });
};
/**
 * フォルダ直下に存在するファイルをフィルタ付きで検出する。
 * @param {string} folder_path フォルダを指定する。
 * @returns 検出されたファイル名、拡張子を出力する。
 */
const filelistget = folder_path => {
    return new Promise((resolve, reject) => {
        fs.readdir(folder_path, { withFileTypes: true }, (err, dirents) => {
            if (err) reject(err);
            if (!dirents) syspend();
            const extensions = [];
            const filenamelist = [];
            for (let i = 0; i != dirents.length; i++) {
                if (!dirents[i].isDirectory()) {
                    const name = dirents[i].name;
                    const namedot = name.split(".");
                    const extension = namedot[namedot.length - 1];
                    for (let i = 0; i != video_extensions.length; i++) {
                        const regexp = new RegExp(extension, "i");
                        if (video_extensions[i].match(regexp)) {
                            filenamelist.push(name.slice(0, -(extension.length + 1)));
                            extensions.push(extension);
                        };
                    };
                };
            };
            console.log(filenamelist)
            resolve({ extensions: extensions, filenamelist: filenamelist });
        });
    });
};
/**
 * jsonデータを読み込む際に使用する。  
 * このコードではかずなみのリポジトリ"data-server"を使用する必要がある。
 * @returns jsonを文字列として出力する。
 */
const jsonload = () => {
    return new Promise((resolve) => {
        const req = http.request("http://localhost", {
            port: 3000,
            method: "post",
            headers: { "Content-Type": "text/plain;charset=utf-8" }
        });
        req.on("response", res => {
            let data = "";
            res.on("data", chunk => { data += chunk; });
            res.on("end", async () => resolve(data));
        });
        req.write(JSON.stringify(["youtube_downloader"]));
        req.on("error", error);
        req.end();
    });
};
/** 
 * 入力内容が間違っていた場合に使用する。
 */
const syspend = () => { console.error("入力された値が不明であったため、操作を中断します。"); process.exit(); };
/**
 * エラーが発生した際に使用される。
 */
const error = e => console.log;
/**
 * メイン
 */
(async () => {
    const json = JSON.parse(await jsonload());
    console.info("変換元は" + json.in_location + "です。\n変換先は" + json.out_location + "です。");
    console.info("上記のパスは、プロクラムを書き換えることで変更することが出来ます。");
    console.info(
        "[1] FFmpegで変換を始める (簡単)\n" +
        "[2] パスを指定してFFmpegで変換を始める (普通)\n" +
        "[3] FFmpegのタグを自分で入力し、パスを指定して変換を始める (上級)\n" +
        "[4] デフォルトのパスを変更する\n" +
        "[5] プリセットを追加・削除する。\n" +
        "[6] 変換元を指定して、プリセットを使用し一括変換する。"
    );
    const selectcmd = Number(await questions("実行するプログラムを選択してください。> "));
    if (!selectcmd || selectcmd > 6) syspend();
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
            const out_location = await questions("変換先のパスを入力してください。 > ");
            if (in_location) json.in_location = in_location;
            if (out_location) json.out_location = out_location;
            const req = http.request("http://localhost", {
                port: 3000,
                method: "post",
                headers: { "Content-Type": "text/plain;charset=utf-8" }
            });
            req.write(JSON.stringify(["youtube_downloader", json]));
            req.on("error", error);
            req.end();
        }
        case 5: {
            let tag = [];
            outs: while (true) {
                console.info("現在の入力済みタグ数は" + tag.length + "です。\n空欄で続行するとタグの入力が完了したことになります。");
                const input = await questions("タグを入力してください。> ");
                if (input == "") break outs;
                tag.push(input);
                continue;
            };
            const display = await questions("タグ名を説明ありで入力してください。 > ");
            json.presets.push({ display: display, tags: tag });
            const req = http.request("http://localhost", {
                port: 3000,
                method: "post",
                headers: { "Content-Type": "text/plain;charset=utf-8" }
            });
            req.write(JSON.stringify(["youtube_downloader", json]));
            req.on("error", error);
            req.end();
            console.info("タグの作成が完了しました。");
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
})();