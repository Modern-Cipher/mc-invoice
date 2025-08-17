/*
 * QR Code generator library (JavaScript)
 *
 * Copyright (c) Project Nayuki. (MIT License)
 * https://www.nayuki.io/page/qr-code-generator-library
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 * - The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * - The Software is provided "as is", without warranty of any kind, express or
 * implied, including but not not limited to the warranties of merchantability,
 * fitness for a particular purpose and noninfringement. In no event shall the
 * authors or copyright holders be liable for any claim, damages or other
 * liability, whether in an action of contract, tort or otherwise, arising from,
 * out of or in connection with the Software or the use or other dealings in the
 * Software.
 */
"use strict";
var qrcodegen;
(function (qrcodegen) {
    /**
     * An appendable sequence of bits (0s and 1s).
     * @see BitBuffer
     */
    class BitBuffer extends Array {
        /**
         * Appends the given number of low-order bits of the given value
         * to this buffer. Requires 0 <= len <= 31 and 0 <= val < 2^len.
         * @param val the value to append
         * @param len the number of bits to append
         */
        appendBits(val, len) {
            if (len < 0 || len > 31 || val >>> len != 0)
                throw "Value out of range";
            for (let i = len - 1; i >= 0; i--) // Append bit by bit
                this.push((val >>> i) & 1);
        }
    }
    qrcodegen.BitBuffer = BitBuffer;
    /**
     * A segment of character/binary/control data in a QR Code symbol.
     * @see QrSegment
     */
    class QrSegment {
        /**
         * Creates a new QR Code segment with the given attributes and data.
         * @param mode the mode indicator for this segment
         * @param numChars the number of characters in this segment
         * @param bitData the data bits of this segment
         */
        constructor(
        /** The mode indicator of this segment. */
        mode, 
        /** The number of characters in the data. */
        numChars, 
        /** The data bits of this segment. */
        bitData) {
            this.mode = mode;
            this.numChars = numChars;
            this.bitData = bitData;
            if (numChars < 0)
                throw "Invalid argument";
            this.bitData = bitData.slice(); // Make defensive copy
        }
        /**
         * Returns a new segment representing the given binary data encoded in byte mode.
         * @param data the binary data
         */
        static makeBytes(data) {
            let bb = new BitBuffer();
            for (const b of data)
                bb.appendBits(b, 8);
            return new QrSegment(QrSegment.Mode.BYTE, data.length, bb);
        }
        /**
         * Returns a new segment representing the given string of decimal digits encoded in numeric mode.
         * @param digits the string of decimal digits
         */
        static makeNumeric(digits) {
            if (!this.isNumeric(digits))
                throw "String contains non-numeric characters";
            let bb = new BitBuffer();
            for (let i = 0; i < digits.length;) { // Consume up to 3 digits per iteration
                const n = Math.min(digits.length - i, 3);
                bb.appendBits(parseInt(digits.substring(i, i + n), 10), n * 3 + 1);
                i += n;
            }
            return new QrSegment(QrSegment.Mode.NUMERIC, digits.length, bb);
        }
        /**
         * Returns a new segment representing the given text string encoded in alphanumeric mode.
         * @param text the text string
         */
        static makeAlphanumeric(text) {
            if (!this.isAlphanumeric(text))
                throw "String contains unencodable characters in alphanumeric mode";
            let bb = new BitBuffer();
            let i;
            for (i = 0; i + 2 <= text.length; i += 2) { // Process groups of 2
                let temp = QrSegment.ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)) * 45;
                temp += QrSegment.ALPHANUMERIC_CHARSET.indexOf(text.charAt(i + 1));
                bb.appendBits(temp, 11);
            }
            if (i < text.length) // 1 character remaining
                bb.appendBits(QrSegment.ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)), 6);
            return new QrSegment(QrSegment.Mode.ALPHANUMERIC, text.length, bb);
        }
        /**
         * Returns a list of zero or more segments to represent the given text string.
         * @param text the text string to be encoded
         */
        static makeSegments(text) {
            // Select the most efficient segment encoding automatically
            if (text == "")
                return [];
            else if (this.isNumeric(text))
                return [QrSegment.makeNumeric(text)];
            else if (this.isAlphanumeric(text))
                return [QrSegment.makeAlphanumeric(text)];
            else
                return [QrSegment.makeBytes(this.toUtf8ByteArray(text))];
        }
        /**
         * Returns a new segment representing an Extended Channel Interpretation
         * (ECI) designator with the given assignment value.
         * @param assignVal the ECI assignment value (see the AIM ECI specification)
         */
        static makeEci(assignVal) {
            let bb = new BitBuffer();
            if (assignVal < 0)
                throw "ECI assignment value out of range";
            else if (assignVal < (1 << 7))
                bb.appendBits(assignVal, 8);
            else if (assignVal < (1 << 14)) {
                bb.appendBits(0b10, 2);
                bb.appendBits(assignVal, 14);
            }
            else if (assignVal < 1000000) {
                bb.appendBits(0b110, 3);
                bb.appendBits(assignVal, 21);
            }
            else
                throw "ECI assignment value out of range";
            return new QrSegment(QrSegment.Mode.ECI, 0, bb);
        }
        /**
         * Returns the number of data bits needed to represent this segment.
         * @param version the QR Code version
         */
        getDataLength() {
            return this.bitData.length;
        }
        // Package-private helper function.
        static getTotalBits(segs, version) {
            let result = 0;
            for (const seg of segs) {
                const ccbits = seg.mode.numCharCountBits(version);
                if (seg.numChars >= (1 << ccbits))
                    return Infinity; // The segment's length doesn't fit the field's bit width
                result += 4 + ccbits + seg.bitData.length;
            }
            return result;
        }
        // Package-private static helper function.
        static toUtf8ByteArray(str) {
            str = encodeURI(str);
            let result = [];
            for (let i = 0; i < str.length; i++) {
                if (str.charAt(i) != "%")
                    result.push(str.charCodeAt(i));
                else {
                    result.push(parseInt(str.substring(i + 1, i + 3), 16));
                    i += 2;
                }
            }
            return result;
        }
    }
    // Static factory methods for QrSegment.
    QrSegment.isNumeric = (text) => {
        return /^[0-9]*$/.test(text);
    };
    QrSegment.isAlphanumeric = (text) => {
        return /^[A-Z0-9 $%*+.\/:-]*$/.test(text);
    };
    // The set of all legal characters in alphanumeric mode, where each character
    // is mapped to its encoding value.
    QrSegment.ALPHANUMERIC_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
    qrcodegen.QrSegment = QrSegment;
    /**
     * A QR Code symbol, which is a type of two-dimension barcode.
     * @see QrCode
     */
    class QrCode {
        /**
         * Creates a new QR Code with the given version number,
         * error correction level, data segments, and mask number.
         * @param version the version number, which is an integer from 1 to 40
         * @param ecc the error correction level
         * @param dataCodewords the data bits with error correction
         * @param msk the mask pattern
         */
        constructor(
        // Scalar properties
        /** The version number of this QR Code, which is an integer in the range [1, 40]. */
        version, 
        /** The error correction level used in this QR Code. */
        errorCorrectionLevel, dataCodewords, 
        /** The mask pattern used in this QR Code, which is an integer in the range [0, 7]. */
        msk) {
            this.version = version;
            this.errorCorrectionLevel = errorCorrectionLevel;
            // The modules of this QR Code (false = white, true = black).
            // Immutable after constructor finishes. Accessed through getModule().
            this.modules = [];
            // Indicates function modules that are not subjected to masking. Discarded when constructor finishes.
            this.isFunction = [];
            // Check arguments
            if (version < QrCode.MIN_VERSION || version > QrCode.MAX_VERSION)
                throw "Version value out of range";
            if (msk < -1 || msk > 7)
                throw "Mask value out of range";
            this.size = version * 4 + 17;
            // Initialize both grids to be size*size arrays of Boolean false
            let row = [];
            for (let i = 0; i < this.size; i++)
                row.push(false);
            for (let i = 0; i < this.size; i++) {
                this.modules.push(row.slice());
                this.isFunction.push(row.slice());
            }
            // Process grid
            this.drawFunctionPatterns();
            const allCodewords = this.addEccAndInterleave(dataCodewords);
            this.drawCodewords(allCodewords);
            // Do masking
            if (msk == -1) { // Automatically choose best mask
                let minPenalty = 1000000000;
                for (let i = 0; i < 8; i++) {
                    this.applyMask(i);
                    this.drawFormatBits(i);
                    const penalty = this.getPenaltyScore();
                    if (penalty < minPenalty) {
                        msk = i;
                        minPenalty = penalty;
                    }
                    this.applyMask(i); // Undoes the mask due to XOR
                }
            }
            if (msk < 0 || msk > 7)
                throw "Assertion error";
            this.mask = msk;
            this.applyMask(msk); // Apply the final choice of mask
            this.drawFormatBits(msk); // Overwrite old format bits
            this.isFunction = [];
        }
        /**
         * Returns a QR Code representing the given Unicode text string at the given error correction level.
         * @param text the text string to be encoded
         * @param ecl the error correction level to use
         */
        static encodeText(text, ecl) {
            const segs = QrSegment.makeSegments(text);
            return QrCode.encodeSegments(segs, ecl);
        }
        /**
         * Returns a QR Code representing the given segments with the given encoding parameters.
         * @param segs the segments to be encoded
         * @param ecl the error correction level to use
         * @param minVersion the minimum allowed version number
         * @param maxVersion the maximum allowed version number
         * @param mask the mask pattern to use, which is an integer from 0 to 7
         * @param boostEcl increases the error correction level if it can be done without increasing the version number
         */
        static encodeSegments(segs, ecl, minVersion = 1, maxVersion = 40, mask = -1, boostEcl = true) {
            if (!(QrCode.MIN_VERSION <= minVersion && minVersion <= maxVersion && maxVersion <= QrCode.MAX_VERSION)
                || mask < -1 || mask > 7)
                throw "Invalid value";
            // Find the minimal version number to use
            let version, dataUsedBits;
            for (version = minVersion;; version++) {
                const dataCapacityBits = QrCode.getNumDataCodewords(version, ecl) * 8;
                dataUsedBits = QrSegment.getTotalBits(segs, version);
                if (dataUsedBits != Infinity && dataUsedBits <= dataCapacityBits)
                    break; // This version number is big enough
                if (version >= maxVersion) // All versions in the range could not fit the given data
                    throw "Data too long";
            }
            // Increase the error correction level while the data still fits in the current version
            for (const newEcl of [QrCode.Ecc.MEDIUM, QrCode.Ecc.QUARTILE, QrCode.Ecc.HIGH]) { // From low to high
                if (boostEcl && dataUsedBits <= QrCode.getNumDataCodewords(version, newEcl) * 8)
                    ecl = newEcl;
            }
            // Concatenate all segments to create the data bit string
            let bb = new BitBuffer();
            for (const seg of segs) {
                bb.appendBits(seg.mode.modeBits, 4);
                bb.appendBits(seg.numChars, seg.mode.numCharCountBits(version));
                bb.push(...seg.bitData);
            }
            if (bb.length != dataUsedBits)
                throw "Assertion error";
            // Add terminator and pad up to a byte if applicable
            const dataCapacityBits = QrCode.getNumDataCodewords(version, ecl) * 8;
            if (bb.length > dataCapacityBits)
                throw "Assertion error";
            bb.appendBits(0, Math.min(4, dataCapacityBits - bb.length));
            bb.appendBits(0, (8 - bb.length % 8) % 8);
            if (bb.length % 8 != 0)
                throw "Assertion error";
            // Pad with alternating bytes until data capacity is reached
            for (let padByte = 0xEC; bb.length < dataCapacityBits; padByte ^= 0xEC ^ 0x11)
                bb.appendBits(padByte, 8);
            // Pack bits into bytes in big-endian
            let dataCodewords = [];
            while (dataCodewords.length * 8 < bb.length) {
                let acc = 0;
                for (let i = 0; i < 8; i++)
                    acc = (acc << 1) | bb[dataCodewords.length * 8 + i];
                dataCodewords.push(acc);
            }
            return new QrCode(version, ecl, dataCodewords, mask);
        }
        /**
         * Returns this QR Code's version, in the range [1, 40].
         */
        getVersion() {
            return this.version;
        }
        /**
         * Returns the width and height of this QR Code, measured in modules, between
         * 21 and 177 (inclusive). This is equal to version * 4 + 17.
         */
        getSize() {
            return this.size;
        }
        /**
         * Returns the error correction level used in this QR Code.
         */
        getErrorCorrectionLevel() {
            return this.errorCorrectionLevel;
        }
        /**
         * Returns the mask pattern used in this QR Code, in the range [0, 7].
         */
        getMask() {
            if (this.mask == -1)
                throw "Mask not chosen yet";
            return this.mask;
        }
        /**
         * Returns the color of the module (pixel) at the given coordinates, which is false
         * for white and true for black. The top left corner has coordinates (x=0, y=0).
         * If the given coordinates are out of bounds, then false (white) is returned.
         * @param x the x coordinate, where 0 is the left edge
         * @param y the y coordinate, where 0 is the top edge
         */
        getModule(x, y) {
            return 0 <= x && x < this.size && 0 <= y && y < this.size && this.modules[y][x];
        }
        /**
         * Draws this QR Code, with the given module scale and border modules, onto the given HTML
         * canvas element. The canvas's width and height is resized to (this.size + border * 2) * scale.
         * The drawn image is be purely black and white, and fully opaque.
         * @param scale the scale factor in pixels per module
         * @param border the number of border modules to add
         * @param canvas the HTML canvas element to draw onto
         * @param lightColor the color for white modules
         * @param darkColor the color for black modules
         */
        drawCanvas(scale, border, canvas, lightColor = "#FFFFFF", darkColor = "#000000") {
            if (scale <= 0 || border < 0)
                throw "Value out of range";
            const width = (this.size + border * 2) * scale;
            canvas.width = width;
            canvas.height = width;
            let ctx = canvas.getContext("2d");
            for (let y = -border; y < this.size + border; y++) {
                for (let x = -border; x < this.size + border; x++) {
                    ctx.fillStyle = this.getModule(x, y) ? darkColor : lightColor;
                    ctx.fillRect((x + border) * scale, (y + border) * scale, scale, scale);
                }
            }
        }
        // Private helper methods for constructor:
        // Puts function patterns in the unused modules of this QR Code grid.
        drawFunctionPatterns() {
            // Draw horizontal and vertical timing patterns
            for (let i = 0; i < this.size; i++) {
                this.setFunctionModule(6, i, i % 2 == 0);
                this.setFunctionModule(i, 6, i % 2 == 0);
            }
            // Draw 3 finder patterns (all corners except bottom right)
            this.drawFinderPattern(3, 3);
            this.drawFinderPattern(this.size - 4, 3);
            this.drawFinderPattern(3, this.size - 4);
            // Draw numerous alignment patterns
            const alignPatPos = this.getAlignmentPatternPositions();
            const numAlign = alignPatPos.length;
            for (let i = 0; i < numAlign; i++) {
                for (let j = 0; j < numAlign; j++) {
                    // Don't draw on the three finder corners
                    if (!((i == 0 && j == 0) || (i == 0 && j == numAlign - 1) || (i == numAlign - 1 && j == 0)))
                        this.drawAlignmentPattern(alignPatPos[i], alignPatPos[j]);
                }
            }
            // Draw configuration data
            this.drawFormatBits(0); // Dummy mask value; overwritten later
            this.drawVersion();
        }
        // Draws two copies of the format bits (with its own error correction code)
        // based on the given mask and this object's error correction level field.
        drawFormatBits(mask) {
            // Calculate error correction code and pack bits
            const data = this.errorCorrectionLevel.formatBits << 3 | mask; // errCorrLvl is uint2, mask is uint3
            let rem = data;
            for (let i = 0; i < 10; i++)
                rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
            const bits = (data << 10 | rem) ^ 0x5412; // uint15
            if (bits >>> 15 != 0)
                throw "Assertion error";
            // Draw first copy
            for (let i = 0; i <= 5; i++)
                this.setFunctionModule(8, i, QrCode.getBit(bits, i));
            this.setFunctionModule(8, 7, QrCode.getBit(bits, 6));
            this.setFunctionModule(8, 8, QrCode.getBit(bits, 7));
            this.setFunctionModule(7, 8, QrCode.getBit(bits, 8));
            for (let i = 9; i < 15; i++)
                this.setFunctionModule(14 - i, 8, QrCode.getBit(bits, i));
            // Draw second copy
            for (let i = 0; i < 8; i++)
                this.setFunctionModule(this.size - 1 - i, 8, QrCode.getBit(bits, i));
            for (let i = 8; i < 15; i++)
                this.setFunctionModule(8, this.size - 15 + i, QrCode.getBit(bits, i));
            this.setFunctionModule(8, this.size - 8, true); // Always black
        }
        // Draws two copies of the version bits (with its own error correction code),
        // based on this object's version field, iff 7 <= version <= 40.
        drawVersion() {
            if (this.version < 7)
                return;
            // Calculate error correction code and pack bits
            let rem = this.version; // version is uint6, in the range [7, 40]
            for (let i = 0; i < 12; i++)
                rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
            const bits = this.version << 12 | rem; // uint18
            if (bits >>> 18 != 0)
                throw "Assertion error";
            // Draw two copies
            for (let i = 0; i < 18; i++) {
                const bit = QrCode.getBit(bits, i);
                const a = this.size - 11 + i % 3;
                const b = Math.floor(i / 3);
                this.setFunctionModule(a, b, bit);
                this.setFunctionModule(b, a, bit);
            }
        }
        // Draws a 9*9 finder pattern including the border separator,
        // with the center module at (x, y). Modules can be out of bounds.
        drawFinderPattern(x, y) {
            for (let dy = -4; dy <= 4; dy++) {
                for (let dx = -4; dx <= 4; dx++) {
                    const dist = Math.max(Math.abs(dx), Math.abs(dy)); // Chebyshev/infinity norm
                    const xx = x + dx, yy = y + dy;
                    if (0 <= xx && xx < this.size && 0 <= yy && yy < this.size)
                        this.setFunctionModule(xx, yy, dist != 2 && dist != 4);
                }
            }
        }
        // Draws a 5*5 alignment pattern, with the center module
        // at (x, y). All modules must be in bounds.
        drawAlignmentPattern(x, y) {
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++)
                    this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) != 1);
            }
        }
        // Sets the color of a module and marks it as a function module.
        // The value can be a Boolean or an integer (0 or 1).
        setFunctionModule(x, y, isBlack) {
            this.modules[y][x] = isBlack;
            this.isFunction[y][x] = true;
        }
        // Returns a new byte array representing the given data added with
        // Reed-Solomon error correction bytes.
        addEccAndInterleave(data) {
            const ver = this.version;
            const ecl = this.errorCorrectionLevel;
            if (data.length != QrCode.getNumDataCodewords(ver, ecl))
                throw "Invalid argument";
            const numBlocks = QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
            const blockEccLen = QrCode.ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver];
            const rawCodewords = Math.floor(QrCode.getNumRawDataModules(ver) / 8);
            const numShortBlocks = numBlocks - rawCodewords % numBlocks;
            const shortBlockLen = Math.floor(rawCodewords / numBlocks);
            // Split data into blocks and append ECC to each block
            let blocks = [];
            const rsDiv = QrCode.reedSolomonComputeDivisor(blockEccLen);
            for (let i = 0, k = 0; i < numBlocks; i++) {
                let dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
                k += dat.length;
                const ecc = QrCode.reedSolomonComputeRemainder(dat, rsDiv);
                if (i < numShortBlocks)
                    dat.push(...ecc);
                blocks.push(dat);
            }
            // Interleave (not concatenate) the bytes from every block into a single sequence
            let result = [];
            for (let i = 0; i < blocks[0].length; i++) {
                for (let j = 0; j < blocks.length; j++) {
                    // Skip the padding byte in short blocks
                    if (i != shortBlockLen - blockEccLen || j >= numShortBlocks)
                        result.push(blocks[j][i]);
                }
            }
            // The following code is similar to the above but interleaves the ECC bytes instead
            for (let i = 0; i < blockEccLen; i++) {
                for (let j = 0; j < blocks.length; j++)
                    result.push(blocks[j][(shortBlockLen - blockEccLen) + i]);
            }
            if (result.length != rawCodewords)
                throw "Assertion error";
            return result;
        }
        // Draws the given sequence of 8-bit codewords (data and error correction)
        // onto the entire grid area, alternating up and down.
        drawCodewords(data) {
            if (data.length != Math.floor(QrCode.getNumRawDataModules(this.version) / 8))
                throw "Invalid argument";
            let i = 0; // Bit index into the data
            // Do the funny zigzag scan
            for (let right = this.size - 1; right >= 1; right -= 2) { // Index of right column in each column pair
                if (right == 6)
                    right = 5;
                for (let vert = 0; vert < this.size; vert++) { // Vertical counter
                    for (let j = 0; j < 2; j++) {
                        const x = right - j; // Actual x coordinate
                        const upward = ((right + 1) & 2) == 0;
                        const y = upward ? this.size - 1 - vert : vert; // Actual y coordinate
                        if (!this.isFunction[y][x] && i < data.length * 8) {
                            this.modules[y][x] = QrCode.getBit(data[i >>> 3], 7 - (i & 7));
                            i++;
                        }
                    }
                }
            }
            if (i != data.length * 8)
                throw "Assertion error";
        }
        // XORs the codeword modules in this QR Code with the given mask pattern.
        // The function modules must be marked and the mask must be within bounds.
        applyMask(mask) {
            if (mask < 0 || mask > 7)
                throw "Mask value out of range";
            for (let y = 0; y < this.size; y++) {
                for (let x = 0; x < this.size; x++) {
                    let invert = false;
                    switch (mask) {
                        case 0:
                            invert = (x + y) % 2 == 0;
                            break;
                        case 1:
                            invert = y % 2 == 0;
                            break;
                        case 2:
                            invert = x % 3 == 0;
                            break;
                        case 3:
                            invert = (x + y) % 3 == 0;
                            break;
                        case 4:
                            invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 == 0;
                            break;
                        case 5:
                            invert = (x * y) % 2 + (x * y) % 3 == 0;
                            break;
                        case 6:
                            invert = ((x * y) % 2 + (x * y) % 3) % 2 == 0;
                            break;
                        case 7:
                            invert = ((x * y) % 3 + (x + y) % 2) % 2 == 0;
                            break;
                    }
                    if (!this.isFunction[y][x] && invert)
                        this.modules[y][x] = !this.modules[y][x];
                }
            }
        }
        // Calculates and returns the penalty score based on state of this QR Code's modules.
        getPenaltyScore() {
            let result = 0;
            // Adjacent modules in row having same color, and finder-like patterns
            for (let y = 0; y < this.size; y++) {
                let runColor = false;
                let runX = 0;
                let runHistory = [0, 0, 0, 0, 0, 0, 0];
                for (let x = 0; x < this.size; x++) {
                    if (this.modules[y][x] == runColor) {
                        runX++;
                        if (runX == 5)
                            result += QrCode.PENALTY_N1;
                        else if (runX > 5)
                            result++;
                    }
                    else {
                        this.finderPenaltyAddHistory(runX, runHistory);
                        if (!runColor)
                            result += this.finderPenaltyCountPatterns(runHistory) * QrCode.PENALTY_N3;
                        runColor = this.modules[y][x];
                        runX = 1;
                    }
                }
                result += this.finderPenaltyTerminateAndCount(runColor, runX, runHistory) * QrCode.PENALTY_N3;
            }
            // Adjacent modules in column having same color, and finder-like patterns
            for (let x = 0; x < this.size; x++) {
                let runColor = false;
                let runY = 0;
                let runHistory = [0, 0, 0, 0, 0, 0, 0];
                for (let y = 0; y < this.size; y++) {
                    if (this.modules[y][x] == runColor) {
                        runY++;
                        if (runY == 5)
                            result += QrCode.PENALTY_N1;
                        else if (runY > 5)
                            result++;
                    }
                    else {
                        this.finderPenaltyAddHistory(runY, runHistory);
                        if (!runColor)
                            result += this.finderPenaltyCountPatterns(runHistory) * QrCode.PENALTY_N3;
                        runColor = this.modules[y][x];
                        runY = 1;
                    }
                }
                result += this.finderPenaltyTerminateAndCount(runColor, runY, runHistory) * QrCode.PENALTY_N3;
            }
            // 2*2 blocks of modules having same color
            for (let y = 0; y < this.size - 1; y++) {
                for (let x = 0; x < this.size - 1; x++) {
                    const color = this.modules[y][x];
                    if (color == this.modules[y][x + 1] &&
                        color == this.modules[y + 1][x] &&
                        color == this.modules[y + 1][x + 1])
                        result += QrCode.PENALTY_N2;
                }
            }
            // Balance of black and white modules
            let black = 0;
            for (const row of this.modules) {
                for (const color of row) {
                    if (color)
                        black++;
                }
            }
            const total = this.size * this.size;
            // Find smallest k such that (45-5k)% <= dark/total*100 <= (55+5k)%
            const k = Math.floor(Math.abs(black * 20 - total * 10) / total);
            result += k * QrCode.PENALTY_N4;
            return result;
        }
        // Returns an array of positions of the alignment patterns in ascending order.
        getAlignmentPatternPositions() {
            if (this.version == 1)
                return [];
            else {
                const numAlign = Math.floor(this.version / 7) + 2;
                const step = (this.version == 32) ? 26 :
                    Math.ceil((this.version * 4 + 4) / (numAlign * 2 - 2)) * 2;
                let result = [6];
                for (let pos = this.size - 7; result.length < numAlign; pos -= step)
                    result.splice(1, 0, pos);
                return result;
            }
        }
        // Returns the number of data bits that can be stored in a QR Code of the given version number, after
        // all function modules are excluded. This includes remainder bits, so it might not be a multiple of 8.
        // The formula is:
        // (total modules) - (finder patterns) - (timing patterns) - (alignment patterns) - (format bits) - (version bits)
        // = (size^2) - (3 * (8*8)) - (2 * (size-16)) - ((numAlign-1)^2 * 5*5) - (2 * 15) - (2 * 18)
        // = size^2 - 192 - 2*size + 32 - 25*(numAlign^2 - 2*numAlign + 1) - 30 - 36
        // = size^2 - 2*size - 221 - 25*numAlign^2 + 50*numAlign - 25
        // = size^2 - 2*size - 246 - 25*numAlign^2 + 50*numAlign
        static getNumRawDataModules(ver) {
            if (ver < QrCode.MIN_VERSION || ver > QrCode.MAX_VERSION)
                throw "Version number out of range";
            let result = (16 * ver + 128) * ver + 64;
            if (ver >= 2) {
                const numAlign = Math.floor(ver / 7) + 2;
                result -= (25 * numAlign - 10) * numAlign - 55;
            }
            if (ver >= 7)
                result -= 36;
            return result;
        }
        // Returns the number of 8-bit data (i.e. not error correction) codewords contained in any
        // QR Code of the given version number and error correction level, with remainder bits discarded.
        static getNumDataCodewords(ver, ecl) {
            return Math.floor(QrCode.getNumRawDataModules(ver) / 8) -
                QrCode.ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver] *
                    QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
        }
        // Returns a Reed-Solomon ECC generator polynomial for the given degree.
        static reedSolomonComputeDivisor(degree) {
            if (degree < 1 || degree > 255)
                throw "Degree out of range";
            // Polynomial coefficients are stored from highest to lowest power, excluding the leading term which is always 1.
            // For example the polynomial x^3 + 255x^2 + 8x + 93 is represented as the array [255, 8, 93].
            let result = [];
            for (let i = 0; i < degree - 1; i++)
                result.push(0);
            result.push(1);
            // Multiply the current product by (x - 2^i) for i = 0, 1, ..., degree-1
            let root = 1;
            for (let i = 0; i < degree; i++) {
                // Multiply the current product by the term (x + root).
                for (let j = 0; j < result.length; j++) {
                    result[j] = QrCode.reedSolomonMultiply(result[j], root);
                    if (j + 1 < result.length)
                        result[j] ^= result[j + 1];
                }
                root = QrCode.reedSolomonMultiply(root, 2);
            }
            return result;
        }
        // Returns the Reed-Solomon error correction codeword for the given data and divisor polynomials.
        static reedSolomonComputeRemainder(data, divisor) {
            let result = divisor.map(_ => 0);
            for (const b of data) { // Polynomial division
                const factor = b ^ result.shift();
                result.push(0);
                for (let i = 0; i < result.length; i++)
                    result[i] ^= QrCode.reedSolomonMultiply(divisor[i], factor);
            }
            return result;
        }
        // Returns the product of the two given field elements modulo GF(2^8/0x11D).
        static reedSolomonMultiply(x, y) {
            if (x >>> 8 != 0 || y >>> 8 != 0)
                throw "Byte out of range";
            // Russian peasant multiplication
            let z = 0;
            for (let i = 7; i >= 0; i--) {
                z = (z << 1) ^ ((z >>> 7) * 0x11D);
                z ^= ((y >>> i) & 1) * x;
            }
            if (z >>> 8 != 0)
                throw "Assertion error";
            return z;
        }
        // Can be packaged as a private function in a class.
        finderPenaltyCountPatterns(runHistory) {
            const n = runHistory[1];
            if (n > 0 && runHistory[2] == n && runHistory[3] == n * 3 && runHistory[4] == n && runHistory[5] == n) {
                if (this.finderPenaltyIsFalseRun(runHistory, 0, 1) && this.finderPenaltyIsFalseRun(runHistory, 5, 1))
                    return 1;
                if (this.finderPenaltyIsFalseRun(runHistory, 6, 0) && this.finderPenaltyIsFalseRun(runHistory, 0, 1) && this.finderPenaltyIsFalseRun(runHistory, 5, 0))
                    return 1;
            }
            return 0;
        }
        // Can be packaged as a private function in a class.
        finderPenaltyTerminateAndCount(currentRunColor, currentRunLength, runHistory) {
            if (currentRunColor) { // Terminate black run
                this.finderPenaltyAddHistory(currentRunLength, runHistory);
                currentRunLength = 0;
            }
            currentRunLength += this.size;
            this.finderPenaltyAddHistory(currentRunLength, runHistory);
            return this.finderPenaltyCountPatterns(runHistory);
        }
        // Can be packaged as a private function in a class.
        finderPenaltyIsFalseRun(runHistory, start, end) {
            for (let i = start; i < end; i++) {
                if (runHistory[i] > 0)
                    return false;
            }
            return true;
        }
        // Can be packaged as a private function in a class.
        finderPenaltyAddHistory(currentRunLength, runHistory) {
            if (runHistory[0] > 0)
                runHistory.unshift(0);
            runHistory.unshift(currentRunLength);
            runHistory.pop();
        }
        // Returns the bit at the given index in the given value.
        static getBit(n, i) {
            return ((n >>> i) & 1) != 0;
        }
    }
    // The minimum version number supported in the QR Code Model 2 standard.
    QrCode.MIN_VERSION = 1;
    // The maximum version number supported in the QR Code Model 2 standard.
    QrCode.MAX_VERSION = 40;
    // For use in getPenaltyScore(), when evaluating adjacent modules.
    QrCode.PENALTY_N1 = 3;
    QrCode.PENALTY_N2 = 3;
    QrCode.PENALTY_N3 = 40;
    QrCode.PENALTY_N4 = 10;
    QrCode.ECC_CODEWORDS_PER_BLOCK = [
        // Version: (note that index 0 is for padding, and is unused)
        //0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40    Error correction level
        [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
        [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
        [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
        [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // High
    ];
    QrCode.NUM_ERROR_CORRECTION_BLOCKS = [
        // Version: (note that index 0 is for padding, and is unused)
        //0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40    Error correction level
        [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
        [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
        [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 32, 34, 36, 38, 40, 43, 45, 48, 51, 54, 57, 60],
        [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66], // High
    ];
    qrcodegen.QrCode = QrCode;
    /**
     * Describes how a segment's data bits are interpreted.
     * @see Mode
     */
    class Mode {
        /**
         * Creates a new mode with the given bit values.
         * @param modeBits the mode indicator bits
         * @param numBitsCharCount the array of character count bit widths
         */
        constructor(
        // The mode indicator bits, which is a uint4 value (range 0-15).
        modeBits, 
        // Number of character count bits for three different version ranges.
        numBitsCharCount) {
            this.modeBits = modeBits;
            this.numBitsCharCount = numBitsCharCount;
        }
        /**
         * Returns the bit width of the character count field for a segment in this mode
         * in a QR Code of the given version number.
         * @param ver the version number
         */
        numCharCountBits(ver) {
            return this.numBitsCharCount[Math.floor((ver + 7) / 17)];
        }
    }
    Mode.NUMERIC = new Mode(0x1, [10, 12, 14]);
    Mode.ALPHANUMERIC = new Mode(0x2, [9, 11, 13]);
    Mode.BYTE = new Mode(0x4, [8, 16, 16]);
    Mode.KANJI = new Mode(0x8, [8, 10, 12]);
    Mode.ECI = new Mode(0x7, [0, 0, 0]);
    qrcodegen.Mode = Mode;
    /**
     * The error correction level in a QR Code symbol.
     * @see Ecc
     */
    class Ecc {
        /**
         * Creates a new error correction level with the given parameters.
         * @param ordinal the ordinal value of this ECC, in the range 0 to 3
         * @param formatBits the format bits of this ECC, in the range 0 to 3
         */
        constructor(
        // In the range 0 to 3 (unsigned 2-bit integer).
        ordinal, 
        // In the range 0 to 3 (unsigned 2-bit integer).
        formatBits) {
            this.ordinal = ordinal;
            this.formatBits = formatBits;
        }
    }
    // The four error correction levels.
    Ecc.LOW = new Ecc(0, 1);
    Ecc.MEDIUM = new Ecc(1, 0);
    Ecc.QUARTILE = new Ecc(2, 3);
    Ecc.HIGH = new Ecc(3, 2);
    qrcodegen.Ecc = Ecc;
})(qrcodegen || (qrcodegen = {}));