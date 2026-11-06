/*
 * Egroup 1.3.0 — a layer-grouping panel for EffectCraft.
 * Independent implementation. No code from Free Compose is used.
 * MIT licensed; see the repository README.
 */
(function (thisObj) {
    var ECG_VERSION = "1.4.0";
    var PANEL_W = 172;
    var PANEL_H = 40;
    var IDS = ["add", "remove", "join", "leave", "show", "hide", "select", "settings"];
    var C_STROKE = "#ffffff";
    var C_BTN = [0.137, 0.145, 0.157, 1];
    var C_BTN_HOVER = [0.22, 0.235, 0.255, 1];
    var C_BTN_PRESS = [0.17, 0.42, 1.0, 1];
    var C_BORDER = [0.23, 0.245, 0.265, 1];
    var C_DISABLED_STROKE = [0.42, 0.43, 0.45, 1];
    var C_DISABLED_BORDER = [0.18, 0.19, 0.205, 1];
    var LANG_MODE = "auto";
    try {
        var _lang = app.settings.getSetting("ECGroup", "lang");
        if (_lang === "zh" || _lang === "en") LANG_MODE = _lang;
    } catch (eLang) {}

    var LINK_MODE = "off";
    try {
        var _link = app.settings.getSetting("ECGroup", "linkMode");
        if (_link === "expr" || _link === "parent") LINK_MODE = _link;
    } catch (eLink) {}
    var LINK_MARK = "/*EgroupLink*/";

    var STR = {
        en: {
            settingsTitle: "Egroup Settings",
            askName: "Ask for a name when creating a group",
            language: "Language",
            follow: "Follow system",
            chinese: "中文",
            english: "English",
            linkMode: "Transform link",
            linkOff: "No transform link",
            linkExpr: "Expression link (keeps keyframes)",
            linkParent: "Direct parent link (moves with group)",
            ok: "OK",
            cancel: "Cancel",
            newGroup: "New Group",
            groupHint: "Name (leave blank to keep the #N prefix)",
            create: "Create",
            needComp: "Open a composition first.",
            selectGroupNull: "Select the layers and one group Null (#N).",
            noData: "That Null has no Egroup data.",
            selectAdd: "Select one or more layers to add.",
            selectRemove: "Select group members to remove.",
            selectToGroup: "Select one or more layers to group.",
            selectInside: "Select a layer inside a group first.",
            disabledTip: "Select a group Null (#N) with layers to enable.",
            tipAdd: "Make Group (selected layers)",
            tipRemove: "Release Group",
            tipJoin: "Add layers to group (select layers + group Null)",
            tipLeave: "Remove layers from group (select layers + group Null)",
            tipShow: "Unshy group layers (timeline)",
            tipHide: "Shy group layers (timeline)",
            tipSelect: "Select group layers",
            tipSettings: "Settings"
        },
        zh: {
            settingsTitle: "Egroup 设置",
            askName: "创建新组时询问名称",
            language: "语言",
            follow: "跟随系统",
            chinese: "中文",
            english: "English",
            linkMode: "变换连接",
            linkOff: "不进行变换连接",
            linkExpr: "通过表达式连接（保留关键帧）",
            linkParent: "直接连接（跟随组移动）",
            ok: "确定",
            cancel: "取消",
            newGroup: "新建组",
            groupHint: "组名（留空则只用 #N 前缀）",
            create: "创建",
            needComp: "请先打开一个合成。",
            selectGroupNull: "请选中要操作的图层，以及一个组空对象（#N）。",
            noData: "这个空对象里没有 Egroup 数据。",
            selectAdd: "请选择要加入的一个或多个图层。",
            selectRemove: "请选择要移出的组内图层。",
            selectToGroup: "请选择一个或多个要建组的图层。",
            selectInside: "请先选中组内的一个图层。",
            disabledTip: "选中组空对象（#N）和图层后可用。",
            tipAdd: "创建组（使用选中图层）",
            tipRemove: "释放组",
            tipJoin: "加入组（选中图层 + 组空对象）",
            tipLeave: "移出组（选中图层 + 组空对象）",
            tipShow: "取消隐藏组内图层（时间线 shy）",
            tipHide: "隐藏组内图层（时间线 shy）",
            tipSelect: "全选组内图层",
            tipSettings: "设置"
        }
    };

    function T(key) {
        var s = STR[UI_LANG] || STR.en;
        return (s && s[key] !== undefined) ? s[key] : (STR.en[key] !== undefined ? STR.en[key] : key);
    }

    // 0.20.0's scripting bridge always reports app.language = 0 and
    // app.isoLanguage = "en_US", even when the host UI is localized. The real
    // preference is general.language ("system" or an explicit code).
    function hostPrefLang() {
        try {
            var p = app.executeCommand("prefs.get");
            return String((p && p.general && p.general.language) || "");
        } catch (e) { return ""; }
    }

    function resolveLang() {
        if (LANG_MODE === "zh" || LANG_MODE === "en") return LANG_MODE;
        var h = hostPrefLang().toLowerCase();
        if (h.indexOf("zh") === 0) return "zh";
        if (h.indexOf("en") === 0) return "en";
        if (h === "system" || h === "") {
            // The host does not expose the resolved system UI language, so use
            // the panel's own default (Chinese) rather than the stubbed en_US.
            return "zh";
        }
        return "en";
    }

    var UI_LANG = resolveLang();
    var BTNS = [];
    var hover = -1;
    var pressed = -1;
    var canvas = null;
    var joinReady = false;
    var leaveReady = false;
    var askGroupName = true;
    try {
        var _askName = app.settings.getSetting("ECGroup", "askName");
        if (String(_askName) === "0") askGroupName = false;
        else if (String(_askName) === "1") askGroupName = true;
    } catch (eAsk) {}

    // ---------------------------------------------------------------- host helpers
    function hostVersionAtLeast(major, minor) {
        try {
            var m = /EffectCraft\s+(\d+)\.(\d+)/.exec(String(app.version || ""));
            if (!m) return false;
            var a = parseInt(m[1], 10), b = parseInt(m[2], 10);
            return a > major || (a === major && b >= minor);
        } catch (e) { return false; }
    }

    // ---------------------------------------------------------------- drawing primitives
    // EffectCraft's ScriptUIGraphics is graphics-level: newPath() clears, moveTo/lineTo append,
    // fillPath(brush) paints the current path. Values are 0..1 RGBA arrays.
    function color(hex, invert, alpha, mono) {
        var a = (alpha === undefined) ? 1 : alpha;
        if (mono) return [0, 0, 0, a];
        var r = parseInt(hex.substr(1, 2), 16);
        var g = parseInt(hex.substr(3, 2), 16);
        var b = parseInt(hex.substr(5, 2), 16);
        if (invert) { r = 255 - r; g = 255 - g; b = 255 - b; }
        return [r / 255, g / 255, b / 255, a];
    }
    function fillRect(g, x, y, w, h, c) {
        if (w <= 0 || h <= 0) return;
        g.newPath();
        g.rectPath(x, y, w, h);
        g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, c));
    }
    function fillRound(g, x, y, w, h, r, c) {
        if (w <= 0 || h <= 0) return;
        r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
        var i, a, seg = Math.max(3, Math.min(6, Math.round(r * 0.55)));
        g.newPath();
        g.moveTo(x + r, y);
        g.lineTo(x + w - r, y);
        for (i = 1; i <= seg; i++) {
            a = -Math.PI / 2 + (Math.PI / 2) * i / seg;
            g.lineTo(x + w - r + Math.cos(a) * r, y + r + Math.sin(a) * r);
        }
        g.lineTo(x + w, y + h - r);
        for (i = 1; i <= seg; i++) {
            a = (Math.PI / 2) * i / seg;
            g.lineTo(x + w - r + Math.cos(a) * r, y + h - r + Math.sin(a) * r);
        }
        g.lineTo(x + r, y + h);
        for (i = 1; i <= seg; i++) {
            a = Math.PI / 2 + (Math.PI / 2) * i / seg;
            g.lineTo(x + r + Math.cos(a) * r, y + h - r + Math.sin(a) * r);
        }
        g.lineTo(x, y + r);
        for (i = 1; i <= seg; i++) {
            a = Math.PI + (Math.PI / 2) * i / seg;
            g.lineTo(x + r + Math.cos(a) * r, y + r + Math.sin(a) * r);
        }
        g.closePath();
        g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, c));
    }
    function fillEllipse(g, cx, cy, rx, ry, c) {
        g.newPath();
        g.ellipsePath(cx - rx, cy - ry, rx * 2, ry * 2);
        g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, c));
    }
    function svgPoly(g, cx, cy, k, coords, c) {
        var i, x, y;
        g.newPath();
        for (i = 0; i < coords.length; i += 2) {
            x = cx + (coords[i] - 288) * k;
            y = cy + (coords[i + 1] - 288) * k;
            if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.closePath();
        g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, c));
    }

    function strokeRound(g, x, y, w, h, r, c, lw) {
        if (w <= 0 || h <= 0) return;
        r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
        var i, a, seg = Math.max(3, Math.min(6, Math.round(r * 0.55)));
        g.newPath();
        g.moveTo(x + r, y);
        g.lineTo(x + w - r, y);
        for (i = 1; i <= seg; i++) {
            a = -Math.PI / 2 + (Math.PI / 2) * i / seg;
            g.lineTo(x + w - r + Math.cos(a) * r, y + r + Math.sin(a) * r);
        }
        g.lineTo(x + w, y + h - r);
        for (i = 1; i <= seg; i++) {
            a = (Math.PI / 2) * i / seg;
            g.lineTo(x + w - r + Math.cos(a) * r, y + h - r + Math.sin(a) * r);
        }
        g.lineTo(x + r, y + h);
        for (i = 1; i <= seg; i++) {
            a = Math.PI / 2 + (Math.PI / 2) * i / seg;
            g.lineTo(x + r + Math.cos(a) * r, y + h - r + Math.sin(a) * r);
        }
        g.lineTo(x, y + r);
        for (i = 1; i <= seg; i++) {
            a = Math.PI + (Math.PI / 2) * i / seg;
            g.lineTo(x + r + Math.cos(a) * r, y + r + Math.sin(a) * r);
        }
        g.closePath();
        g.strokePath(g.newPen(g.PenType.SOLID_COLOR, c, lw));
    }
    function strokeEllipse(g, cx, cy, rx, ry, c, lw) {
        g.newPath();
        g.ellipsePath(cx - rx, cy - ry, rx * 2, ry * 2);
        g.strokePath(g.newPen(g.PenType.SOLID_COLOR, c, lw));
    }
    function strokePoly(g, cx, cy, k, coords, c, lw) {
        var i, x, y;
        g.newPath();
        for (i = 0; i < coords.length; i += 2) {
            x = cx + (coords[i] - 288) * k;
            y = cy + (coords[i + 1] - 288) * k;
            if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.closePath();
        g.strokePath(g.newPen(g.PenType.SOLID_COLOR, c, lw));
    }
    function strokeLine(g, x1, y1, x2, y2, c, lw) {
        g.newPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.strokePath(g.newPen(g.PenType.SOLID_COLOR, c, lw));
    }

    var PLUS = [
        254.703, 236.51, 254.703, 111.218, 310.312, 111.218, 310.312, 236.51,
        435.604, 236.51, 435.604, 292.119, 310.312, 292.119, 310.312, 417.411,
        254.703, 417.411, 254.703, 292.119, 129.411, 292.119, 129.411, 236.51
    ];
    var CURSOR = [
        255.8, 231.9, 222.7, 445.7, 222.6, 448.4, 223, 451, 224, 453.3, 225.5, 455.3,
        227.3, 457, 229.4, 458.2, 231.8, 459.1, 234.2, 459.4, 236.8, 459.1, 239.3, 458.3,
        276.4, 433.9, 278.3, 432.8, 280.3, 432.2, 282.4, 431.9, 284.4, 432, 286.4, 432.4,
        288.3, 433.1, 290, 434.2, 291.5, 435.5, 292.8, 437.1, 293.8, 439, 308.4, 487.9,
        309.4, 490.4, 310.9, 492.4, 312.7, 494.1, 314.8, 495.4, 317.2, 496.1, 319.6, 496.4,
        322.1, 496.2, 324.6, 495.4, 342.6, 487.3, 344.4, 486.3, 346, 485, 347.3, 483.4,
        348.4, 481.7, 349.1, 479.8, 349.5, 477.8, 349.5, 475.7, 349.2, 473.6, 338, 429,
        337.6, 426.8, 337.7, 424.6, 338.2, 422.5, 339, 420.6, 340.2, 418.8, 341.6, 417.3,
        343.3, 416, 345.2, 415.1, 347.2, 414.5, 349.4, 414.3, 392.9, 419.6, 395.7, 419.7,
        398.3, 419.1, 400.6, 418, 402.6, 416.5, 404.2, 414.6, 405.4, 412.4, 406.1, 410,
        406.3, 407.5, 406, 405, 405, 402.5, 277.1, 226.7, 275.1, 224.6, 272.9, 223.1,
        270.5, 222.2, 268, 221.8, 265.5, 222, 263.1, 222.7, 260.8, 223.8, 258.9, 225.4,
        257.3, 227.5, 256.2, 230, 255.8, 231.9
    ];

    var ARROW_IN = [
        210, 270, 360, 270, 360, 226, 434, 288, 360, 350, 360, 306, 210, 306
    ];
    var ARROW_OUT = [
        366, 270, 216, 270, 216, 226, 142, 288, 216, 350, 216, 306, 366, 306
    ];
    var BRACKET_L = [
        200, 150, 140, 150, 140, 426, 200, 426
    ];
    var BRACKET_R = [
        376, 150, 436, 150, 436, 426, 376, 426
    ];

    // iconGeo returns the coordinate transform for an icon. The select icon's
    // artwork sits in the lower-right of the 576 box, so it is scaled up and
    // re-centred independently; otherwise it looks much smaller than the rest.
    function iconGeo(id, cx, cy, size) {
        var sel = (id === "select");
        var k = size / 576 * (sel ? 1.45 : 1);
        var wx = sel ? 312.45 : 288;
        var wy = sel ? 344.15 : 288;
        return {
            k: k,
            X: function (x) { return cx + (x - wx) * k; },
            Y: function (y) { return cy + (y - wy) * k; },
            px: cx + (288 - wx) * k,
            py: cy + (288 - wy) * k
        };
    }

    function drawJoinLeave(g, id, cx, cy, size, c, lw, filled) {
        var k = size / 576;
        function X(x) { return cx + (x - 288) * k; }
        function Y(y) { return cy + (y - 288) * k; }
        var segs = (id === "join") ? BRACKET_L : BRACKET_R;
        function bracket(width) {
            g.newPath();
            g.moveTo(X(segs[0]), Y(segs[1]));
            g.lineTo(X(segs[2]), Y(segs[3]));
            g.lineTo(X(segs[4]), Y(segs[5]));
            g.lineTo(X(segs[6]), Y(segs[7]));
            g.strokePath(g.newPen(g.PenType.SOLID_COLOR, c, width));
        }
        if (filled) {
            svgPoly(g, cx, cy, k, (id === "join") ? ARROW_IN : ARROW_OUT, c);
            bracket(lw * 1.4);
        } else {
            strokePoly(g, cx, cy, k, (id === "join") ? ARROW_IN : ARROW_OUT, c, lw);
            bracket(lw);
        }
    }

    function drawIcon(g, id, cx, cy, size, bg, strokeColor) {
        var G = iconGeo(id, cx, cy, size);
        var k = G.k;
        var lw = Math.max(1.4, Math.min(3, size * 0.042));
        var c = strokeColor || color(C_STROKE, false);
        var X = G.X, Y = G.Y;

        // Every filled body is first painted with the button's own background,
        // then outlined. That opaque fill is what hides the lines underneath
        // where two strokes cross (the "遮挡" of the original icons).
        if (id === "add") {
            fillRound(g, X(25.745), Y(197.035), 513.526 * k, 134.56 * k, 25 * k, bg);
            strokeRound(g, X(25.745), Y(197.035), 513.526 * k, 134.56 * k, 25 * k, c, lw);
            svgPoly(g, G.px, G.py, k, PLUS, bg);
            strokePoly(g, G.px, G.py, k, PLUS, c, lw);
        } else if (id === "remove") {
            fillRound(g, X(25.745), Y(197.035), 513.526 * k, 134.56 * k, 25 * k, bg);
            strokeRound(g, X(25.745), Y(197.035), 513.526 * k, 134.56 * k, 25 * k, c, lw);
            fillRound(g, X(254.703), Y(111.218), 55.609 * k, 306.193 * k, 0, bg);
            strokeRound(g, X(254.703), Y(111.218), 55.609 * k, 306.193 * k, 0, c, lw);
        } else if (id === "show") {
            fillEllipse(g, X(287.997), Y(288), 281.01 * k, 131.471 * k, bg);
            strokeEllipse(g, X(287.997), Y(288), 281.01 * k, 131.471 * k, c, lw);
            fillEllipse(g, X(288), Y(288), 90.5 * k, 90.5 * k, bg);
            strokeEllipse(g, X(288), Y(288), 90.5 * k, 90.5 * k, c, lw);
        } else if (id === "hide") {
            fillEllipse(g, X(288), Y(288), 281.01 * k, 56.33 * k, bg);
            strokeEllipse(g, X(288), Y(288), 281.01 * k, 56.33 * k, c, lw);
            strokeLine(g, X(153.32), Y(288), X(422.68), Y(288), c, lw);
        } else if (id === "select") {
            fillEllipse(g, X(268.599), Y(241.92), 50 * k, 50 * k, bg);
            strokeEllipse(g, X(268.599), Y(241.92), 50 * k, 50 * k, c, lw);
            svgPoly(g, G.px, G.py, k, CURSOR, bg);
            strokePoly(g, G.px, G.py, k, CURSOR, c, lw);
        } else if (id === "join" || id === "leave") {
            drawJoinLeave(g, id, cx, cy, size, c, lw, false);
        } else if (id === "settings") {
            var bars = [210, 288, 366];
            for (var bi = 0; bi < bars.length; bi++) {
                strokeLine(g, X(170), Y(bars[bi]), X(406), Y(bars[bi]), c, lw * 1.4);
            }
        }
    }

    // Grid layout modelled on KCurve's preset grid: try every column count,
    // keep the one that gives the largest square cell, then centre each row.
    function buildLayout(W, H) {
        var ids = IDS, n = ids.length, pad = 8, gap = 6;
        var availW = Math.max(1, W - 2 * pad);
        var availH = Math.max(1, H - 2 * pad);
        var bestCell = -1, bestCols = 1, bestRows = 1;
        for (var cols = 1; cols <= n; cols++) {
            var rows = Math.ceil(n / cols);
            var cw = Math.floor((availW - (cols - 1) * gap) / cols);
            var ch = Math.floor((availH - (rows - 1) * gap) / rows);
            var cell = Math.min(cw, ch);
            if (cell > bestCell || (cell === bestCell && cols > bestCols)) {
                bestCell = cell;
                bestCols = cols;
                bestRows = rows;
            }
        }
        var cell = Math.max(14, bestCell);
        var cols = bestCols, rows = bestRows;
        var totalH = rows * cell + (rows - 1) * gap;
        var y0 = Math.floor((H - totalH) / 2);
        BTNS = [];
        for (var i = 0; i < n; i++) {
            var row = Math.floor(i / cols);
            var col = i - row * cols;
            var inRow = Math.min(cols, n - row * cols);
            var rowW = inRow * cell + (inRow - 1) * gap;
            var rowX = Math.floor((W - rowW) / 2);
            BTNS.push({
                id: ids[i],
                x: rowX + col * (cell + gap),
                y: y0 + row * (cell + gap),
                w: cell,
                h: cell,
                disabled: (ids[i] === "join" && !joinReady) || (ids[i] === "leave" && !leaveReady)
            });
        }
    }

    function drawIconPressed(g, id, cx, cy, size) {
        var G = iconGeo(id, cx, cy, size);
        var k = G.k;
        var lw = Math.max(1.4, Math.min(3, size * 0.042));
        var X = G.X, Y = G.Y;
        var white = [1, 1, 1, 1];
        var bg = C_BTN_PRESS;

        if (id === "add") {
            fillRound(g, X(25.745), Y(197.035), 513.526 * k, 134.56 * k, 25 * k, white);
            svgPoly(g, G.px, G.py, k, PLUS, white);
        } else if (id === "remove") {
            fillRound(g, X(25.745), Y(197.035), 513.526 * k, 134.56 * k, 25 * k, white);
            fillRound(g, X(254.703), Y(111.218), 55.609 * k, 306.193 * k, 0, white);
        } else if (id === "show") {
            fillEllipse(g, X(287.997), Y(288), 281.01 * k, 131.471 * k, white);
            fillEllipse(g, X(288), Y(288), 90.5 * k, 90.5 * k, bg);
        } else if (id === "hide") {
            fillEllipse(g, X(288), Y(288), 281.01 * k, 56.33 * k, white);
            strokeLine(g, X(153.32), Y(288), X(422.68), Y(288), bg, lw);
        } else if (id === "select") {
            fillEllipse(g, X(268.599), Y(241.92), 50 * k, 50 * k, white);
            svgPoly(g, G.px, G.py, k, CURSOR, white);
        } else if (id === "join" || id === "leave") {
            drawJoinLeave(g, id, cx, cy, size, white, lw, true);
        } else if (id === "settings") {
            var bars = [210, 288, 366];
            for (var bi = 0; bi < bars.length; bi++) {
                fillRound(g, X(170), Y(bars[bi]) - lw * 0.9, 236 * k, lw * 1.8, lw * 0.9, white);
            }
        }
    }

    function drawButton(g, b, i) {
        var r = Math.max(4, Math.min(9, Math.round(b.w * 0.16)));
        var dis = !!b.disabled;
        var bg = dis ? C_BTN : ((pressed === i) ? C_BTN_PRESS : (hover === i ? C_BTN_HOVER : C_BTN));
        var border = dis ? C_DISABLED_BORDER : ((pressed === i) ? [0.42, 0.62, 1, 1] : C_BORDER);
        fillRound(g, b.x, b.y, b.w, b.h, r, bg);
        strokeRound(g, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, r, border, 1);
        var iconScale = (b.id === "select") ? 0.80 : (b.id === "join" || b.id === "leave") ? 0.72 : 0.62;
        var iconSize = Math.round(b.w * iconScale);
        var cxm = b.x + b.w / 2, cym = b.y + b.h / 2;
        if (!dis && pressed === i) drawIconPressed(g, b.id, cxm, cym, iconSize);
        else drawIcon(g, b.id, cxm, cym, iconSize, bg, dis ? C_DISABLED_STROKE : null);
    }

    function onDraw() {
        var g = canvas.graphics;
        var W = canvas.size.width, H = canvas.size.height;
        if (!(W > 2) || !(H > 2)) { W = PANEL_W; H = PANEL_H; }
        try {
            var c = app.project.activeItem;
            if (c && c instanceof CompItem) migrateGroupNames(c);
        } catch (eMig) {}
        refreshGroupActions();
        buildLayout(W, H);
        fillRect(g, 0, 0, W, H, [0.11, 0.11, 0.12, 1]);
        for (var i = 0; i < BTNS.length; i++) drawButton(g, BTNS[i], i);
    }

    function redraw() {
        try { canvas.notify("onDraw"); }
        catch (e) { try { canvas.onDraw(); } catch (e2) {} }
    }

    // ---------------------------------------------------------------- grouping (no parenting)
    function activeComp() {
        var c = app.project.activeItem;
        if (!c || !(c instanceof CompItem)) throw new Error(T("needComp"));
        return c;
    }
    function selectedLayers(c) {
        var out = [], s = c.selectedLayers;
        for (var i = 0; i < s.length; i++) out.push(s[i]);
        return out;
    }
    function groupNo(name) {
        // New groups use "#N"; "Group: N" is kept readable for projects made
        // with Egroup 1.0.x and older test builds.
        var m = /^(?:Group:\s*|#\s*)(\d+)/.exec(String(name));
        return m ? parseInt(m[1], 10) : 0;
    }
    function groupComment(nul) {
        var m = /^ECG:(\d+)\|(.*)$/.exec(String((nul && nul.comment) || ""));
        if (!m) return null;
        var ids = [];
        if (m[2]) {
            var parts = m[2].split(",");
            for (var i = 0; i < parts.length; i++) {
                var id = parseInt(parts[i], 10);
                if (id > 0) ids.push(id);
            }
        }
        return { n: parseInt(m[1], 10), ids: ids };
    }
    function layerById(c, id) {
        for (var i = 1; i <= c.layers.length; i++) {
            if (c.layer(i).id === id) return c.layer(i);
        }
        return null;
    }
    function groupMembers(c, g) {
        var out = [];
        for (var i = 0; i < g.ids.length; i++) {
            var L = layerById(c, g.ids[i]);
            if (L) out.push(L);
        }
        out.sort(function (a, b) { return a.index - b.index; });
        return out;
    }
    function groupFor(c, layer) {
        if (!layer) return null;
        var n = groupNo(layer.name);
        if (n) {
            var data = groupComment(layer);
            if (data) return { n: data.n, nul: layer, ids: data.ids };
        }
        for (var i = 1; i <= c.layers.length; i++) {
            var L = c.layer(i);
            if (!groupNo(L.name)) continue;
            var d = groupComment(L);
            if (!d) continue;
            for (var j = 0; j < d.ids.length; j++) {
                if (d.ids[j] === layer.id) return { n: d.n, nul: L, ids: d.ids };
            }
        }
        return null;
    }
    function nextNo(c) {
        var max = 0;
        for (var i = 1; i <= c.layers.length; i++) {
            var n = groupNo(c.layer(i).name);
            if (n > max) max = n;
        }
        return max + 1;
    }
    function targetGroup(c) {
        var sel = selectedLayers(c);
        for (var i = 0; i < sel.length; i++) {
            var g = groupFor(c, sel[i]);
            if (g) return g;
        }
        return null;
    }

    // ---------------------------------------------------------------- group visibility
    // A group Null's eye (layer.enabled) drives its members: switching the Null
    // off hides every member; switching it back on restores the member states
    // that were in effect before the Null was switched off. ScriptUI has no
    // layer-change event, so a lightweight repeating task polls open project.
    var migratedCompId = 0;

    function migrateGroupNames(c) {
        if (!c || migratedCompId === c.id) return;
        migratedCompId = c.id;
        for (var i = 1; i <= c.layers.length; i++) {
            var L = c.layer(i);
            if (!groupComment(L)) continue;
            var m = /^Group:\s*(\d+)/.exec(String(L.name || ""));
            if (!m) continue;
            var suffix = String(L.name).replace(/^Group:\s*\d+\s*\|?\s*/, "");
            L.name = "#" + m[1] + (suffix ? " | " + suffix : "");
        }
    }

    function visibilityState() {
        if (!$.global.ecgVisibilityState) $.global.ecgVisibilityState = {};
        return $.global.ecgVisibilityState;
    }

    function shyTouched() {
        if (!$.global.ecgShyTouched) $.global.ecgShyTouched = {};
        return $.global.ecgShyTouched;
    }

    function ensureCompShy(c) {
        // The composition-level "Enables Shy" switch is separate from each
        // layer's shy icon. Group members are marked shy, so a group is not
        // really tidy until this master switch is on.
        try {
            if (c && c.hideShyLayers !== true) c.hideShyLayers = true;
        } catch (eShy) {}
    }

    function syncGroupVisibility() {
        var c = app.project.activeItem;
        if (!c || !(c instanceof CompItem)) return;
        try { cleanupOrphanLinks(c); } catch (eClean) {}
        var state = visibilityState();
        var seen = {};
        var hasGroup = false;
        for (var i = 1; i <= c.layers.length; i++) {
            var nul = c.layer(i);
            var n = groupNo(nul.name);
            var g = groupComment(nul);
            if (!n || !g) continue;
            hasGroup = true;
            seen[nul.id] = true;
            var members = groupMembers(c, { n: g.n, nul: nul, ids: g.ids });
            var memberIds = {};
            for (var j = 0; j < members.length; j++) memberIds[members[j].id] = true;
            var rec = state[nul.id];
            if (nul.enabled === false) {
                if (!rec) rec = state[nul.id] = {};
                for (var j2 = 0; j2 < members.length; j2++) {
                    var L = members[j2];
                    if (!rec.hasOwnProperty(L.id)) rec[L.id] = !!L.enabled;
                    if (L.enabled) L.enabled = false;
                }
            } else if (nul.enabled === true && rec) {
                for (var id in rec) {
                    if (!rec.hasOwnProperty(id)) continue;
                    if (!memberIds[id]) { delete rec[id]; continue; }
                    var M = layerById(c, parseInt(id, 10));
                    if (M) M.enabled = rec[id];
                }
                delete state[nul.id];
            }
        }
        for (var key in state) {
            if (!seen[key]) delete state[key];
        }
        if (hasGroup) {
            var touched = shyTouched();
            if (!touched[c.id]) {
                ensureCompShy(c);
                touched[c.id] = true;
            }
        }
        try { syncGroupEffects(c); } catch (eFx) {}
    }

    // ---------------------------------------------------------------- group effects
    // Effects on the group Null are mirrored onto each member layer. The copies
    // are ordinary effects, updated four times a second, so the member's own
    // transform/keyframes and effect stack are not modified except for the
    // "[ECG ...]" copies. A group Null is a control layer, not a render layer,
    // so this is how its effects become visible.
    function isEcgEffect(e) {
        return /^\[ECG\b/.test(String((e && e.name) || ""));
    }

    function ecgEffects(layer) {
        var out = [];
        try {
            var fx = layer.property("Effects");
            for (var i = 1; i <= fx.numProperties; i++) {
                var e = fx.property(i);
                if (isEcgEffect(e)) out.push(e);
            }
        } catch (e1) {}
        return out;
    }

    function plainEffects(layer) {
        var out = [];
        try {
            var fx = layer.property("Effects");
            for (var i = 1; i <= fx.numProperties; i++) {
                var e = fx.property(i);
                if (!isEcgEffect(e)) out.push(e);
            }
        } catch (e2) {}
        return out;
    }

    function effectCopyName(n, src) {
        return "[ECG #" + n + "] " + String(src.name || src.matchName || "Effect");
    }

    function removeEcgEffects(layer) {
        try {
            var fx = layer.property("Effects");
            for (var i = fx.numProperties; i >= 1; i--) {
                if (isEcgEffect(fx.property(i))) fx.property(i).remove();
            }
        } catch (e3) {}
    }

    function updateEffectCopy(dst, src) {
        try { dst.enabled = !!src.enabled; } catch (e0) {}
        var n = Math.min(dst.numProperties, src.numProperties);
        for (var i = 1; i <= n; i++) {
            try {
                var dp = dst.property(i), sp = src.property(i);
                if (dp && sp) dp.setValue(sp.value);
            } catch (e4) {}
        }
    }

    function addEffectCopy(layer, src, copyName) {
        try {
            var dst = layer.property("Effects").addProperty(src.matchName);
            dst.name = copyName;
            updateEffectCopy(dst, src);
            return dst;
        } catch (e5) { return null; }
    }

    function syncMemberEffects(layer, n, srcEffects) {
        var copies = ecgEffects(layer);
        var rebuild = copies.length !== srcEffects.length;
        if (!rebuild) {
            for (var i = 0; i < srcEffects.length; i++) {
                if (String(copies[i].name) !== effectCopyName(n, srcEffects[i])) { rebuild = true; break; }
            }
        }
        if (rebuild) {
            removeEcgEffects(layer);
            for (var j = 0; j < srcEffects.length; j++) addEffectCopy(layer, srcEffects[j], effectCopyName(n, srcEffects[j]));
        } else {
            for (var k = 0; k < srcEffects.length; k++) updateEffectCopy(copies[k], srcEffects[k]);
        }
    }

    function syncGroupEffects(c) {
        if (!c || !(c instanceof CompItem)) return;
        var groupNul = {}, memberGroup = {};
        for (var i = 1; i <= c.layers.length; i++) {
            var L = c.layer(i);
            var d = groupComment(L);
            if (!d || !groupNo(L.name)) continue;
            groupNul[d.n] = L;
            var members = groupMembers(c, { n: d.n, nul: L, ids: d.ids });
            for (var j = 0; j < members.length; j++) {
                if (members[j].id !== L.id) memberGroup[members[j].id] = d.n;
            }
        }
        for (var k = 1; k <= c.layers.length; k++) {
            var M = c.layer(k);
            if (groupComment(M)) continue;
            var gn = memberGroup[M.id];
            var nul = gn ? groupNul[gn] : null;
            if (!nul) { removeEcgEffects(M); continue; }
            syncMemberEffects(M, gn, plainEffects(nul));
        }
    }

    // ---------------------------------------------------------------- transform links
    // "off" leaves the members alone. "parent" makes each member a child of the
    // group Null (EffectCraft compensates the position, so the layer does not
    // jump). "expr" writes a marked expression on position/scale/rotation; the
    // baseline is captured as a literal, so "value" keeps the layer's own
    // keyframes and the expression only adds the group's delta.
    function linkParents() {
        if (!$.global.ecgLinkParents) $.global.ecgLinkParents = {};
        return $.global.ecgLinkParents;
    }

    function saveLinkMode(v) {
        try { app.settings.saveSetting("ECGroup", "linkMode", v); } catch (e) {}
    }

    function isOurExpr(s) {
        return String(s || "").indexOf(LINK_MARK) === 0;
    }

    function linkProperties(L) {
        return [L.transform.position, L.transform.scale, L.transform.rotation];
    }

    function clearLinkExpressions(L) {
        var props = linkProperties(L);
        for (var i = 0; i < props.length; i++) {
            try {
                if (isOurExpr(props[i].expression)) props[i].expression = "";
            } catch (e) {}
        }
    }

    function exprGroupName(s) {
        // Extract the group layer name from our position expression. Names with
        // backslashes/quotes are escaped by exprName(), so decode them here.
        var m = /var g=thisComp\.layer\("((?:\\.|[^"\\])*)"\)/.exec(String(s || ""));
        if (!m) return "";
        return m[1].replace(/\\([\\"])/g, "$1");
    }

    function cleanupOrphanLinks(c) {
        // If the group Null is deleted directly in the timeline (instead of
        // using Release), the expression's thisComp.layer(name) target is gone.
        // Remove our expressions and stale parent records so the member does not
        // keep throwing "layer not found" errors.
        var changed = false;
        var map = linkParents();
        for (var i = 1; i <= c.layers.length; i++) {
            var L = c.layer(i);
            var props = linkProperties(L), j;
            var ours = false, orphan = false;
            for (j = 0; j < props.length; j++) {
                var s = "";
                try { s = String(props[j].expression || ""); } catch (eS) {}
                if (!isOurExpr(s)) continue;
                ours = true;
                var nm = exprGroupName(s), g = null;
                if (nm) { try { g = c.layer(nm); } catch (eG) {} }
                if (!g || !groupComment(g)) { orphan = true; break; }
            }
            if (!ours || !orphan) continue;
            clearLinkExpressions(L);
            if (map.hasOwnProperty(L.id)) delete map[L.id];
            changed = true;
        }
        return changed;
    }

    function parentIdOf(L) {
        try { var p = L.parent; return p ? p.id : 0; } catch (e) { return 0; }
    }

    function restoreOriginalParent(c, L) {
        var map = linkParents();
        if (!map.hasOwnProperty(L.id)) return;
        var id = map[L.id];
        delete map[L.id];
        try { L.parent = id ? layerById(c, id) : null; } catch (e) {}
    }

    function unlinkMember(c, L) {
        if (!L) return;
        clearLinkExpressions(L);
        restoreOriginalParent(c, L);
    }

    function exprNumber(v) {
        var n = Number(v);
        if (!isFinite(n)) n = 0;
        return String(Math.round(n * 10000) / 10000);
    }

    function exprArray(a, count) {
        var out = [], i;
        for (i = 0; i < count; i++) {
            var v = (a && a.length > i) ? a[i] : (i === 2 ? 100 : 0);
            out.push(exprNumber(v));
        }
        return "[" + out.join(",") + "]";
    }

    function exprName(s) {
        return String(s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    }

    function detachForExpression(c, L, nul) {
        // Only the group's own Null conflicts with the expression: keeping it
        // would move the member twice. An unrelated parent is a normal
        // hierarchy and is left alone.
        if (!nul || L.parent !== nul) return;
        var map = linkParents();
        if (!map.hasOwnProperty(L.id)) {
            var pid = parentIdOf(L);
            if (pid) map[L.id] = pid;
        }
        try { L.parent = null; } catch (eD) {}
    }

    function applyLinkToMember(c, L, nul) {
        if (!L || !nul || L.id === nul.id) return;
        if (LINK_MODE === "off") {
            unlinkMember(c, L);
            return;
        }
        if (LINK_MODE === "parent") {
            clearLinkExpressions(L);
            var map = linkParents();
            if (!map.hasOwnProperty(L.id)) map[L.id] = parentIdOf(L);
            try { L.parent = nul; } catch (eP) {}
            return;
        }

        var props = linkProperties(L), i;
        for (i = 0; i < props.length; i++) {
            var old = "";
            try { old = String(props[i].expression || ""); } catch (eOld) {}
            if (old && !isOurExpr(old)) return; // do not fight a user expression
        }

        // Expression mode: detach any parent while active, so the group's
        // world-space delta is not applied twice. The original parent is kept
        // in ecgLinkParents and restored when the link is turned off.
        detachForExpression(c, L, nul);
        clearLinkExpressions(L);

        var nm = exprName(nul.name);
        var is3 = !!L.threeDLayer;
        try {
            var pn = props[0], sn = props[1], rn = props[2];
            var pb = exprArray(nul.transform.position.value, is3 ? 3 : 2);
            pn.expression = LINK_MARK + 'var g=thisComp.layer("' + nm + '");var b=' +
                pb + ';g?value+(g.transform.position-b):value;';

            var comps = is3 ? 3 : 2;
            var sb = exprArray(nul.transform.scale.value, comps), parts = [];
            for (i = 0; i < comps; i++) {
                parts.push("value[" + i + "]*g.transform.scale[" + i + "]/b[" + i + "]");
            }
            sn.expression = LINK_MARK + 'var g=thisComp.layer("' + nm + '");var b=' +
                sb + ";g?[" + parts.join(",") + "]:value;";

            var rb = exprNumber(nul.transform.rotation.value);
            rn.expression = LINK_MARK + 'var g=thisComp.layer("' + nm + '");g?value+(g.transform.rotation-' +
                rb + "):value;";
        } catch (eApply) {}
    }

    function applyLinkToGroup(c, g) {
        if (!c || !g || !g.nul) return;
        var members = groupMembers(c, g);
        for (var i = 0; i < members.length; i++) applyLinkToMember(c, members[i], g.nul);
    }

    function applyLinkModeAll() {
        try {
            var c = app.project.activeItem;
            if (!c || !(c instanceof CompItem)) return;
            for (var i = 1; i <= c.layers.length; i++) {
                var L = c.layer(i);
                var d = groupComment(L);
                if (!d || !groupNo(L.name)) continue;
                applyLinkToGroup(c, { n: d.n, nul: L, ids: d.ids });
            }
        } catch (eAll) {}
    }

    function startVisibilityPoll() {
        try {
            if ($.global.ecgVisibilityTask) {
                try { app.cancelTask($.global.ecgVisibilityTask); } catch (eC) {}
            }
            $.global.ecgVisibilitySync = syncGroupVisibility;
            $.global.ecgVisibilityTask = app.scheduleTask("ecgVisibilitySync()", 250, true);
        } catch (ePoll) {}
    }

    function selectedGroupNull(c) {
        var sel = selectedLayers(c), found = null, count = 0;
        for (var i = 0; i < sel.length; i++) {
            var L = sel[i];
            if (groupNo(L.name) && groupComment(L)) { found = L; count++; }
        }
        return (count === 1) ? found : null;
    }

    function refreshGroupActions() {
        var canJoin = false, canLeave = false;
        try {
            var c = app.project.activeItem;
            if (c && c instanceof CompItem) {
                var nul = selectedGroupNull(c);
                if (nul) {
                    var g = groupComment(nul);
                    var sel = selectedLayers(c);
                    for (var i = 0; i < sel.length; i++) {
                        var L = sel[i];
                        if (L.id === nul.id) continue;
                        if (g && hasId(g.ids, L.id)) canLeave = true;
                        else if (!groupNo(L.name)) canJoin = true;
                    }
                }
            }
        } catch (e) {}
        if (canJoin !== joinReady || canLeave !== leaveReady) {
            joinReady = canJoin;
            leaveReady = canLeave;
            hover = -1;
            pressed = -1;
            return true;
        }
        return false;
    }

    function hasId(list, id) {
        for (var i = 0; i < list.length; i++) if (list[i] === id) return true;
        return false;
    }

    // A layer can belong to only one EC group. Remove membership ids from every
    // group Null except the one that is being written.
    function stripFromOtherGroups(c, ids, exceptId) {
        for (var i = 1; i <= c.layers.length; i++) {
            var other = c.layer(i);
            if (other.id === exceptId) continue;
            var d = groupComment(other);
            if (!d) continue;
            var kept = [], changed = false;
            for (var j = 0; j < d.ids.length; j++) {
                if (hasId(ids, d.ids[j])) changed = true;
                else kept.push(d.ids[j]);
            }
            if (changed) other.comment = "ECG:" + d.n + "|" + kept.join(",");
        }
    }

    function joinSelected() {
        var c = activeComp();
        var nul = selectedGroupNull(c);
        if (!nul) { alert(T("selectGroupNull")); return; }
        var g = groupComment(nul);
        if (!g) { alert(T("noData")); return; }
        var sel = selectedLayers(c), add = [], addIds = [], i;
        for (i = 0; i < sel.length; i++) {
            var L = sel[i];
            if (L.id !== nul.id && !groupNo(L.name)) add.push(L);
        }
        if (!add.length) { alert(T("selectAdd")); return; }
        add.sort(function (a, b) { return a.index - b.index; });
        for (i = 0; i < add.length; i++) addIds.push(add[i].id);

        app.beginUndoGroup("Egroup: Add Layers " + g.n);
        stripFromOtherGroups(c, addIds, nul.id);
        var ids = g.ids.slice();
        for (i = 0; i < add.length; i++) if (!hasId(ids, add[i].id)) ids.push(add[i].id);
        nul.comment = "ECG:" + g.n + "|" + ids.join(",");
        // Membership is stored in the Null's comment; layers keep their stack
        // position, so joining does not move them under the Null.
        applyLinkToGroup(c, { n: g.n, nul: nul, ids: ids });
        app.endUndoGroup();
        refreshGroupActions();
        redraw();
    }

    function leaveSelected() {
        var c = activeComp();
        var nul = selectedGroupNull(c);
        if (!nul) { alert(T("selectGroupNull")); return; }
        var g = groupComment(nul);
        if (!g) { alert(T("noData")); return; }
        var sel = selectedLayers(c), remove = [], i;
        for (i = 0; i < sel.length; i++) {
            var L = sel[i];
            if (L.id !== nul.id && hasId(g.ids, L.id)) remove.push(L.id);
        }
        if (!remove.length) { alert(T("selectRemove")); return; }
        var kept = [];
        for (i = 0; i < g.ids.length; i++) if (!hasId(remove, g.ids[i])) kept.push(g.ids[i]);
        app.beginUndoGroup("Egroup: Remove Layers " + g.n);
        for (i = 0; i < remove.length; i++) {
            var removed = layerById(c, remove[i]);
            if (removed) unlinkMember(c, removed);
        }
        nul.comment = "ECG:" + g.n + "|" + kept.join(",");
        app.endUndoGroup();
        refreshGroupActions();
        redraw();
    }

    function saveAskName(v) {
        try { app.settings.saveSetting("ECGroup", "askName", v ? "1" : "0"); } catch (e) {}
    }

    function saveLang(v) {
        try { app.settings.saveSetting("ECGroup", "lang", v); } catch (e) {}
    }

    function showSettings() {
        var w = new Window("dialog", T("settingsTitle"));
        w.orientation = "column";
        w.alignChildren = ["left", "top"];
        w.margins = 16;
        var cb = w.add("checkbox", undefined, T("askName"));
        cb.value = askGroupName;
        var lrow = w.add("group");
        lrow.add("statictext", undefined, T("language") + ":");
        var dd = lrow.add("dropdownlist", undefined, [T("follow"), T("chinese"), T("english")]);
        dd.selection = (LANG_MODE === "zh") ? 1 : (LANG_MODE === "en") ? 2 : 0;

        var linkPanel = w.add("panel", undefined, T("linkMode"));
        linkPanel.orientation = "column";
        linkPanel.alignChildren = ["left", "top"];
        linkPanel.margins = 10;
        var rOff = linkPanel.add("radiobutton", undefined, T("linkOff"));
        var rExpr = linkPanel.add("radiobutton", undefined, T("linkExpr"));
        var rParent = linkPanel.add("radiobutton", undefined, T("linkParent"));
        rOff.value = (LINK_MODE === "off");
        rExpr.value = (LINK_MODE === "expr");
        rParent.value = (LINK_MODE === "parent");

        var row = w.add("group");
        row.alignment = ["right", "top"];
        var ok = row.add("button", undefined, T("ok"));
        var cancel = row.add("button", undefined, T("cancel"));
        var linkChanged = false;
        ok.onClick = function () {
            askGroupName = !!cb.value;
            saveAskName(askGroupName);
            var idx = dd.selection ? dd.selection.index : 0;
            LANG_MODE = (idx === 1) ? "zh" : (idx === 2) ? "en" : "auto";
            saveLang(LANG_MODE);
            UI_LANG = resolveLang();
            var newLink = rOff.value ? "off" : (rExpr.value ? "expr" : "parent");
            if (newLink !== LINK_MODE) {
                LINK_MODE = newLink;
                saveLinkMode(LINK_MODE);
                linkChanged = true;
            }
            w.close(1);
        };
        cancel.onClick = function () { w.close(0); };
        w.center();
        var accepted = w.show();
        if (accepted === 1 && linkChanged) {
            applyLinkModeAll();
            redraw();
        }
    }

    // New groups are named "#N" (plus an optional user label). "Group: N" is
    // still accepted so projects created with Egroup 1.0.x keep working.
    function groupNameFromInput(raw, n) {
        var s = String(raw === undefined || raw === null ? "" : raw).replace(/^\s+|\s+$/g, "");
        if (s && /^(?:Group:\s*\d+|#\s*\d+)/.test(s)) {
            s = s.replace(/^(?:Group:\s*\d+|#\s*\d+)\s*\|?\s*/, "");
        }
        return "#" + n + (s ? " | " + s : "");
    }

    function promptGroupName(n) {
        var w = new Window("dialog", T("newGroup"));
        w.orientation = "column";
        w.alignChildren = ["left", "top"];
        w.margins = 16;
        w.add("statictext", undefined, T("groupHint"));
        var edit = w.add("edittext", undefined, "#" + n);
        edit.characters = 32;
        var row = w.add("group");
        row.alignment = ["right", "top"];
        var ok = row.add("button", undefined, T("create"));
        var cancel = row.add("button", undefined, T("cancel"));
        var accepted = false;
        ok.onClick = function () { accepted = true; w.close(1); };
        cancel.onClick = function () { w.close(0); };
        w.center();
        w.show();
        if (!accepted) return null;
        return groupNameFromInput(edit.text, n);
    }

    function makeGroup() {
        var c = activeComp();
        var sel = selectedLayers(c);
        var members = [];
        for (var i = 0; i < sel.length; i++) {
            var L = sel[i];
            if (!groupNo(L.name)) members.push(L);
        }
        if (!members.length) { alert(T("selectToGroup")); return; }
        members.sort(function (a, b) { return a.index - b.index; });
        var top = members[0];
        var n = nextNo(c);
        var groupName = "#" + n;
        if (askGroupName) {
            var prompted = promptGroupName(n);
            if (prompted === null) return;
            groupName = prompted;
        }
        var ids = [];
        for (i = 0; i < members.length; i++) ids.push(members[i].id);
        app.beginUndoGroup("Egroup: Make Group " + n);
        var nul = c.layers.addNull();
        nul.moveBefore(top);
        nul.name = groupName;
        nul.comment = "ECG:" + n + "|" + ids.join(",");
        nul.label = 9;
        nul.shy = false;
        ensureCompShy(c);
        shyTouched()[c.id] = true;
        stripFromOtherGroups(c, ids, nul.id);
        applyLinkToGroup(c, { n: n, nul: nul, ids: ids });
        app.endUndoGroup();
        redraw();
    }

    function releaseGroup() {
        var c = activeComp();
        var g = targetGroup(c);
        if (!g) { alert(T("selectInside")); return; }
        app.beginUndoGroup("Egroup: Release Group " + g.n);
        var members = groupMembers(c, g);
        for (var i = 0; i < members.length; i++) unlinkMember(c, members[i]);
        g.nul.remove();
        app.endUndoGroup();
        redraw();
    }

    function setShy(hide) {
        var c = activeComp();
        var g = targetGroup(c);
        if (!g) { alert(T("selectInside")); return; }
        var members = groupMembers(c, g);
        app.beginUndoGroup(hide ? "Egroup: Shy Layers" : "Egroup: Unshy Layers");
        for (var i = 0; i < members.length; i++) members[i].shy = hide;
        app.endUndoGroup();
        redraw();
    }

    function selectGroup() {
        var c = activeComp();
        var g = targetGroup(c);
        if (!g) { alert(T("selectInside")); return; }
        var i;
        for (i = 1; i <= c.layers.length; i++) c.layer(i).selected = false;
        g.nul.selected = true;
        var members = groupMembers(c, g);
        for (i = 0; i < members.length; i++) members[i].selected = true;
        redraw();
    }

    function doAction(id) {
        try {
            if (id === "add") makeGroup();
            else if (id === "remove") releaseGroup();
            else if (id === "join") joinSelected();
            else if (id === "leave") leaveSelected();
            else if (id === "show") setShy(false);
            else if (id === "hide") setShy(true);
            else if (id === "select") selectGroup();
            else if (id === "settings") showSettings();
        } catch (e) {
            alert(e && e.message ? e.message : String(e));
        }
    }

    // ---------------------------------------------------------------- events
    function hitTest(x, y) {
        for (var i = 0; i < BTNS.length; i++) {
            var b = BTNS[i];
            if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return i;
        }
        return -1;
    }
    function onMouseMove(e) {
        if (refreshGroupActions()) redraw();
        var i = hitTest(e.clientX, e.clientY);
        if (i !== hover) {
            hover = i;
            var tip = "";
            if (i >= 0) tip = BTNS[i].disabled ? T("disabledTip") : T("tip" + BTNS[i].id.charAt(0).toUpperCase() + BTNS[i].id.substr(1));
            try { canvas.helpTip = tip; } catch (e1) {}
            redraw();
        }
    }
    function onMouseDown(e) {
        if (refreshGroupActions()) redraw();
        var i = hitTest(e.clientX, e.clientY);
        if (i >= 0 && !BTNS[i].disabled) { pressed = i; redraw(); }
    }
    function onMouseUp(e) {
        if (refreshGroupActions()) redraw();
        var i = hitTest(e.clientX, e.clientY);
        if (pressed >= 0 && i === pressed && !BTNS[i].disabled) {
            var id = BTNS[i].id;
            pressed = -1;
            redraw();
            doAction(id);
        } else {
            pressed = -1;
            redraw();
        }
    }
    function onMouseOut() {
        if (hover !== -1 || pressed !== -1) {
            hover = -1;
            pressed = -1;
            redraw();
        }
    }

    // ---------------------------------------------------------------- build
    var isPanel = (thisObj instanceof Panel);
    var win = isPanel ? thisObj : new Window("palette", "Egroup " + ECG_VERSION, undefined, { resizeable: true });
    win.orientation = "stack";
    win.alignChildren = ["fill", "fill"];
    win.margins = 0;
    win.spacing = 0;

    var adaptive = false;
    try { adaptive = hostVersionAtLeast(0, 19); } catch (e0) {}
    var preferred = [PANEL_W, PANEL_H];
    try { win.preferredSize = preferred; } catch (e1) {}

    canvas = win.add("panel", undefined, undefined, { name: "canvas" });
    canvas.alignment = ["fill", "fill"];
    try { canvas.preferredSize = preferred; } catch (e2) {}
    canvas.onDraw = onDraw;
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseout", onMouseOut);

    if (!isPanel) {
        win.size = [PANEL_W, PANEL_H];
        win.center();
        win.show();
    }
    win.layout.layout(true);
    try { win.onResizing = function () { redraw(); }; win.onResize = function () { redraw(); }; } catch (e3) {}
    startVisibilityPoll();
    redraw();
})(this);

