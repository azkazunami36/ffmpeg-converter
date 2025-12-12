import fsP from "fs/promises";
import readline from "readline";
import path from 'path';
import { exec } from "child_process";
import fluentFfmpeg from "fluent-ffmpeg";
import { existsSync, rmSync } from "fs";

const video_extensions = ["mp4", "mov", "mkv", "avi", "m4v"];

async function question(text: string): Promise<string> {
    const iface = readline.createInterface({ input: process.stdin, output: process.stdout })
    return await new Promise(resolve => iface.question(text + "> ", answer => { iface.close(); resolve(answer) }))
}

function textLength(string: string) {
    let length = 0;
    for (let i = 0; i !== string.length; i++) string[i].match(/[ -~]/) ? length += 1 : length += 2;
    return length;
}

function FFmpeg進捗状況パーサー(string: string) {
    const json: {
        frame: number | null;
        fps: number | null;
        q: number | null;
        size: number | null;
        time: number | null;
        bitrate: number | null;
        speed: number | null;
        elapsed: number | null;
    } = {
        frame: null,
        fps: null,
        q: null,
        size: null,
        time: null,
        bitrate: null,
        speed: null,
        elapsed: null
    }
    const スペースでとりあえず分割 = string.split(" ").filter(value => value !== "");
    const プロパティ名リスト = Object.keys(json);
    const 生データ: string[] = [];
    for (const プロパティ名 of プロパティ名リスト) {
        const プロパティ名と一致する場所 = スペースでとりあえず分割.findIndex((value, index) => {
            return value.startsWith(プロパティ名);
        });
        if (プロパティ名と一致する場所 === -1) continue;
        const プロパティ名と一致するデータ = スペースでとりあえず分割[プロパティ名と一致する場所];
        const 生の値 = プロパティ名と一致するデータ === プロパティ名 + "=" ? プロパティ名と一致するデータ + スペースでとりあえず分割[プロパティ名と一致する場所 + 1] : プロパティ名と一致するデータ;
        生データ.push(生の値);
        const value = 生の値.split("=")[1];
        if (value === undefined) continue;
        if (プロパティ名 === "frame" || プロパティ名 === "fps" || プロパティ名 === "q") {
            json[プロパティ名] = Number(value);
            continue;
        }
        if (プロパティ名 === "time" || プロパティ名 === "elapsed") {
            /** 一番右が秒。時間:分:秒.00のような形式であると予測される。 */
            const nums = value.split(":");
            let second = 0;
            for (let i = 0; i < nums.length; i++) {
                const num = nums[i];
                second += Number(num) * (60 ** (nums.length - i - 1));
            }
            json[プロパティ名] = second;
        }
        if (プロパティ名 === "size") {
            if (value.endsWith("KiB")) json.size = Number(value.slice(0, value.length - 3));
        }
        if (プロパティ名 === "bitrate") {
            if (value.endsWith("kbits/s")) json.bitrate = Number(value.slice(0, value.length - 7));
        }
        if (プロパティ名 === "speed") {
            if (value.endsWith("x")) json.speed = Number(value.slice(0, value.length - 1));
        }
    }
    if (json.elapsed !== null && json.fps !== null && json.frame !== null && json.size !== null && json.speed !== null && json.time !== null) {
        return {
            elapsed: json.elapsed,
            fps: json.fps,
            frame: json.frame,
            size: json.size,
            speed: json.speed,
            time: json.time,
            q: json.q,
            bitrate: json.bitrate
        };
    }
}

function パスエスケープ修正(string: string) {
    string = string.replaceAll("\"", "");
    string = string.replaceAll("'", "");
    string = string.replaceAll("“", "");
    string = string.replaceAll("`", "");
    string = string.replaceAll("\\ ", " ");
    return string;
}

async function main() {
    console.log("このプログラムでは変換を7つ同時に実行します。負荷が大きいですが、並列処理に向いている処理の場合、速度が上がる可能性があります。");
    console.log("また、変換先のフォルダに同じ名前のファイルが存在する場合にエラーが発生する場合があります。注意してください。");
    console.log("拡張子を変更する機能は現時点で存在しません。");
    const 変換元のフォルダパス = path.resolve(process.cwd(), パスエスケープ修正(await question("変換元のパスを指定してください。")));
    if (!(await fsP.stat(変換元のフォルダパス)).isDirectory()) throw new Error("このパスはファイルです。");
    const 変換先のフォルダパス = path.resolve(process.cwd(), パスエスケープ修正(await question("変換先のパスを指定してください。")));
    if (!(await fsP.stat(変換先のフォルダパス)).isDirectory()) throw new Error("このパスはファイルです。");
    const FFmpeg入力オプション = await question("FFmpegの入力に使用するオプションを入力してください。標準は空です。");
    const FFmpeg出力オプション = (await question("FFmpegの出力に使用するオプションを入力してください。標準は[-c:v hevc_nvenc -c:a copy -tag:v hvc1 -b:v 0 -cq 25 -rc-lookahead 20 -preset p7]です。")) || "-c:v hevc_nvenc -c:a copy -tag:v hvc1 -b:v 0 -cq 25 -rc-lookahead 20 -preset p7";
    /** フォルダ内ファイルの順番と同期してください。 */
    const status: {
        status: "waiting" | "processing" | "done";
        /** 100%中。doneの時は100とみなす。 */
        progress: number;
    }[] = [];
    const 変換元のフォルダ = await fsP.readdir(変換元のフォルダパス);
    let プログレスを表示した時 = 0;
    function progressViewer() {
        const nowTime = Date.now();
        if ((プログレスを表示した時 + 32) > nowTime) return;
        プログレスを表示した時 = nowTime;
        /** [x, y]。xが横、yが縦。 */
        const size = process.stdout.getWindowSize();
        /**  */
        const percent = status.reduce((a, b) => a + (b.status === "done" ? 100 : b.progress) / 変換元のフォルダ.length, 0);
        const メッセージ = "変換中 " + Math.floor(percent) + "%(" + (1 + status.filter(status => status.status === "done").length) + "/" + 変換元のフォルダ.length + ")";
        const プログレスバーの長さ = size[0] - textLength(メッセージ) - 5;
        const 有効プログレス長さ = percent / 100 * プログレスバーの長さ;
        const 無効プログレス長さ = (100 - percent) / 100 * プログレスバーの長さ;

        readline.cursorTo(process.stdout, 0);
        readline.clearLine(process.stdout, 0);
        process.stdout.write(メッセージ + "[" + "#".repeat(有効プログレス長さ > 0 ? 有効プログレス長さ : 0) + " ".repeat(無効プログレス長さ > 0 ? 無効プログレス長さ : 0) + "]");
        readline.moveCursor(process.stdout, 0, 0);
        readline.cursorTo(process.stdout, 0);
    }
    function convert() {
        progressViewer();
        let 終了済みかどうか = false;
        function 実行中の数() { return status.filter(data => data.status === "processing").length };
        function 実行開始した数() { return status.filter(data => data.status === "processing" || data.status === "done").length };
        if (実行中の数() === 0 && 実行開始した数() >= 変換元のフォルダ.length) return console.log("全ての変換が終了しました。");
        if (実行中の数() >= 7) return;
        if (実行開始した数() >= 変換元のフォルダ.length) return;
        for (let i = 0; i < 変換元のフォルダ.length; i++) {
            if (video_extensions.filter(ext => 変換元のフォルダ[実行開始した数()].toLowerCase().endsWith("." + ext)).length > 0) break;
            status[実行開始した数()] = { progress: 100, status: "done" };
        }
        const name = 変換元のフォルダ[実行開始した数()];
        const i = 実行開始した数();
        status[i] = { progress: 0, status: "processing" };
        const ファイルパス = path.resolve(process.cwd(), 変換元のフォルダパス + "/" + name);
        const 出力先ファイルパス = path.resolve(process.cwd(), 変換先のフォルダパス + "/" + name);
        fluentFfmpeg.ffprobe(ファイルパス, (err, data) => {
            if (err) {
                readline.clearLine(process.stdout, 0);
                console.error("【エラー】ファイル「" + name + "」は正しく処理できませんでした。\n", err, "FFprobeが動作しませんでした。");
                status[i].status = "done";
                convert();
                return;
            }
            if (existsSync(出力先ファイルパス)) rmSync(出力先ファイルパス);
            const duration = Number(data.streams.reduce((a, data) => Number(a.duration) && Number(data.duration) && Number(a.duration) < Number(data.duration) ? data : a).duration);
            const ffmpeg = exec("ffmpeg " + FFmpeg入力オプション + " -i \"" + ファイルパス + "\" " + FFmpeg出力オプション + " \"" + 出力先ファイルパス + "\"");
            function 終了メッセージ() {
                if (終了済みかどうか) return;
                readline.clearLine(process.stdout, 0);
                console.log("「" + name + "」の変換が終了しました。");
                終了済みかどうか = true;
                ffmpeg.kill();
                status[i].status = "done";
                convert();
            }
            ffmpeg.on("close", 終了メッセージ);
            ffmpeg.on("exit", 終了メッセージ);
            let stddata = "";
            ffmpeg.stderr?.on("data", chunk => {
                stddata += chunk;
                const progress = FFmpeg進捗状況パーサー(chunk);
                if (progress) status[i].progress = (progress.time / duration) * 100;
                progressViewer();
            });
            ffmpeg.on("error", e => {
                if (終了済みかどうか) return;
                終了済みかどうか = true;
                ffmpeg.kill();
                readline.clearLine(process.stdout, 0);
                console.error("【エラー】ファイル「" + name + "」は正しく処理できませんでした。\n", e, "次のデータはFFmpeg出力の生データの一部始終です。", stddata.slice(stddata.length - 1000, stddata.length));
                status[i].status = "done";
                convert();
            });
            convert();
        })
    }
    convert();
}

main();
