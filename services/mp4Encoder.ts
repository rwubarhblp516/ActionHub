/**
 * MP4 编码器 - 使用 WebCodecs API
 * 生成真正的 MP4 文件, 包含必要的 moov 索引, 兼容主流视频播放器和编辑软件
 */

// @ts-ignore
declare const VideoEncoder: any;
// @ts-ignore
declare const VideoFrame: any;

interface MP4EncoderConfig {
    width: number;
    height: number;
    fps: number;
    bitrate?: number;
}

interface Sample {
    data: Uint8Array;
    type: 'key' | 'delta';
    timestamp: number; // 微秒
    duration: number; // 微秒
    size: number;
}

export class MP4Encoder {
    private canvas: HTMLCanvasElement;
    private config: MP4EncoderConfig;
    private encoder: any;
    private samples: Sample[] = [];
    private frameCount: number = 0;
    private isEncoding: boolean = false;
    private description: Uint8Array | null = null; // AVCC Extra Data (SPS/PPS)

    constructor(canvas: HTMLCanvasElement, config: MP4EncoderConfig) {
        this.canvas = canvas;
        this.config = {
            ...config,
            bitrate: config.bitrate || config.width * config.height * config.fps * 0.15
        };
    }

    async start(): Promise<void> {
        if (typeof VideoEncoder === 'undefined') {
            throw new Error('WebCodecs API 不支持。请使用 Chrome 94+ 或 Edge 94+');
        }

        this.samples = [];
        this.frameCount = 0;
        this.isEncoding = true;

        const encoderConfig = {
            codec: 'avc1.420034', // Baseline Level 5.2
            width: this.config.width,
            height: this.config.height,
            bitrate: this.config.bitrate,
            framerate: this.config.fps,
            avc: { format: 'avc' } // 使用 AVCC 格式而非 Annex B, 更适合 MP4
        };

        this.encoder = new VideoEncoder({
            output: (chunk: any, metadata: any) => {
                // 如果 metadata 中包含 decoderConfig, 提取 description (SPS/PPS)
                if (metadata && metadata.decoderConfig && metadata.decoderConfig.description) {
                    this.description = new Uint8Array(metadata.decoderConfig.description);
                }

                const data = new Uint8Array(chunk.byteLength);
                chunk.copyTo(data);

                this.samples.push({
                    data,
                    type: chunk.type,
                    timestamp: chunk.timestamp,
                    duration: chunk.duration || (1000000 / this.config.fps),
                    size: chunk.byteLength
                });
            },
            error: (error: Error) => {
                console.error('MP4 编码错误:', error);
                this.isEncoding = false;
            }
        });

        this.encoder.configure(encoderConfig);
        console.log('MP4 编码器已启动:', encoderConfig);
    }

    async encodeFrame(customTimestamp?: number): Promise<void> {
        if (!this.isEncoding || !this.encoder || this.encoder.state === 'closed') return;

        try {
            const timestamp = customTimestamp !== undefined ?
                customTimestamp :
                (this.frameCount * 1000000) / this.config.fps;

            const videoFrame = new VideoFrame(this.canvas, {
                timestamp,
                duration: 1000000 / this.config.fps
            });

            // 每 2 秒一个关键帧
            const keyFrame = this.frameCount % (this.config.fps * 2) === 0;
            this.encoder.encode(videoFrame, { keyFrame });
            videoFrame.close();

            this.frameCount++;
        } catch (error) {
            console.error('编码帧失败:', error);
            throw error;
        }
    }

    async stop(): Promise<Blob> {
        this.isEncoding = false;

        if (!this.encoder) throw new Error('编码器未初始化');

        await this.encoder.flush();
        this.encoder.close();

        if (this.samples.length === 0) {
            throw new Error('未捕获到任何帧');
        }

        console.log(`编码完成: ${this.frameCount} 帧, 准备封装 MP4...`);

        const mp4Data = this.mux();
        // 确保使用兼容的 ArrayBuffer 类型
        const buffer = mp4Data.buffer.slice(mp4Data.byteOffset, mp4Data.byteOffset + mp4Data.byteLength) as ArrayBuffer;
        return new Blob([buffer], { type: 'video/mp4' });
    }

    /**
     * 极简 MP4 封装 (ISO BMFF)
     */
    private mux(): Uint8Array {
        const movieDuration = this.samples.reduce((acc, s) => acc + s.duration, 0);
        const timescale = 1000000; // 微秒级别

        // 1. ftyp
        const ftyp = this.box('ftyp', [
            this.str('isom'), // major brand
            this.u32(0x200),  // minor version
            this.str('isom'), // compatible brands
            this.str('iso2'),
            this.str('avc1'),
            this.str('mp41')
        ]);

        // 2. mdat
        let totalSize = 0;
        this.samples.forEach(s => totalSize += s.size);
        const mdatHeader = new Uint8Array(8);
        new DataView(mdatHeader.buffer).setUint32(0, totalSize + 8);
        mdatHeader.set(this.str('mdat'), 4);

        const mdat = new Uint8Array(8 + totalSize);
        mdat.set(mdatHeader, 0);
        let offset = 8;
        this.samples.forEach(s => {
            mdat.set(s.data, offset);
            offset += s.size;
        });

        // 3. moov
        const moov = this.box('moov', [
            // mvhd
            this.box('mvhd', [
                this.u8(0), // version
                this.u24(0), // flags
                this.u32(0), // creation time
                this.u32(0), // modification time
                this.u32(timescale),
                this.u32(movieDuration),
                this.u32(0x00010000), // rate
                this.u16(0x0100), // volume
                new Uint8Array(10), // reserved
                this.matrix(), // matrix
                new Uint8Array(24), // pre-defined
                this.u32(2) // next track ID
            ]),
            // trak
            this.box('trak', [
                // tkhd
                this.box('tkhd', [
                    this.u8(0),
                    this.u24(3), // enabled, in movie, in preview
                    this.u32(0), this.u32(0), // times
                    this.u32(1), // track ID
                    this.u32(0), // reserved
                    this.u32(movieDuration),
                    this.u32(0), this.u32(0), // reserved
                    this.u16(0), // layer
                    this.u16(0), // alternate group
                    this.u16(0x0100), // volume
                    this.u16(0), // reserved
                    this.matrix(),
                    this.u32(this.config.width << 16),
                    this.u32(this.config.height << 16)
                ]),
                // mdia
                this.box('mdia', [
                    this.box('mdhd', [
                        this.u8(0), this.u24(0),
                        this.u32(0), this.u32(0),
                        this.u32(timescale),
                        this.u32(movieDuration),
                        this.u16(0x55c4), // language und
                        this.u16(0)
                    ]),
                    this.box('hdlr', [
                        this.u8(0), this.u24(0),
                        this.u32(0), // pre-defined
                        this.str('vide'), // handler type
                        new Uint8Array(12), // reserved
                        this.str('VideoHandler\0') // name
                    ]),
                    // minf
                    this.box('minf', [
                        this.box('vmhd', [this.u8(0), this.u24(1), this.u16(0), new Uint8Array(6)]),
                        this.box('dinf', [
                            this.box('dref', [
                                this.u8(0), this.u24(0),
                                this.u32(1), // entry count
                                this.box('url ', [this.u8(0), this.u24(1)])
                            ])
                        ]),
                        // stbl
                        this.box('stbl', [
                            // stsd
                            this.box('stsd', [
                                this.u8(0), this.u24(0),
                                this.u32(1), // entry count
                                this.box('avc1', [
                                    new Uint8Array(6), // reserved
                                    this.u16(1), // data reference index
                                    this.u16(0), this.u16(0), // pre-defined, reserved
                                    this.u32(0), this.u32(0), this.u32(0), // pre-defined
                                    this.u16(this.config.width),
                                    this.u16(this.config.height),
                                    this.u32(0x00480000), this.u32(0x00480000), // resolution
                                    this.u32(0), // reserved
                                    this.u16(1), // frame count
                                    new Uint8Array(32), // compressor name
                                    this.u16(0x0018), // depth
                                    this.u16(0xffff), // pre-defined
                                    this.description ? this.box('avcC', [this.description]) : new Uint8Array(0)
                                ])
                            ]),
                            // stts
                            this.box('stts', [
                                this.u8(0), this.u24(0),
                                this.u32(1), // entry count
                                this.u32(this.samples.length),
                                this.u32(Math.round(movieDuration / this.samples.length))
                            ]),
                            // stss (key frames)
                            this.box('stss', [
                                this.u8(0), this.u24(0),
                                this.u32(this.samples.filter(s => s.type === 'key').length),
                                ...this.samples.map((s, i) => s.type === 'key' ? this.u32(i + 1) : null).filter(x => x !== null) as Uint8Array[]
                            ]),
                            // stsc
                            this.box('stsc', [
                                this.u8(0), this.u24(0),
                                this.u32(1), // entry count
                                this.u32(1), this.u32(1), this.u32(1)
                            ]),
                            // stsz
                            this.box('stsz', [
                                this.u8(0), this.u24(0),
                                this.u32(0), // sample size (0 means varied)
                                this.u32(this.samples.length),
                                ...this.samples.map(s => this.u32(s.size))
                            ]),
                            // stco
                            this.box('stco', [
                                this.u8(0), this.u24(0),
                                this.u32(this.samples.length),
                                ...(() => {
                                    let currentOffset = ftyp.byteLength + mdatHeader.byteLength;
                                    return this.samples.map(s => {
                                        const res = this.u32(currentOffset);
                                        currentOffset += s.size;
                                        return res;
                                    });
                                })()
                            ])
                        ])
                    ])
                ])
            ])
        ]);

        const result = new Uint8Array(ftyp.byteLength + mdat.byteLength + moov.byteLength);
        result.set(ftyp, 0);
        result.set(mdat, ftyp.byteLength);
        result.set(moov, ftyp.byteLength + mdat.byteLength);
        return result;
    }

    // --- 辅助方法 ---
    private box(type: string, contents: (Uint8Array | null)[]): Uint8Array {
        let size = 8;
        contents.forEach(c => { if (c) size += c.byteLength; });
        const res = new Uint8Array(size);
        const view = new DataView(res.buffer);
        view.setUint32(0, size);
        res.set(this.str(type), 4);
        let offset = 8;
        contents.forEach(c => {
            if (c) {
                res.set(c, offset);
                offset += c.byteLength;
            }
        });
        return res;
    }

    private u8(v: number) { return new Uint8Array([v]); }
    private u16(v: number) { const a = new Uint8Array(2); new DataView(a.buffer).setUint16(0, v); return a; }
    private u24(v: number) { return new Uint8Array([(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]); }
    private u32(v: number) { const a = new Uint8Array(4); new DataView(a.buffer).setUint32(0, v); return a; }
    private str(s: string) { return new TextEncoder().encode(s); }
    private matrix() {
        const m = new Uint8Array(36);
        const v = new DataView(m.buffer);
        v.setUint32(0, 0x00010000); v.setUint32(16, 0x00010000); v.setUint32(32, 0x40000000);
        return m;
    }

    getFrameCount(): number { return this.frameCount; }
}

/**
 * MP4 录制器 - 包装类
 */
export class MP4Recorder {
    private canvas: HTMLCanvasElement;
    private encoder: MP4Encoder;
    private fps: number;

    constructor(canvas: HTMLCanvasElement, fps: number, width: number, height: number, bitrate?: number) {
        this.canvas = canvas;
        this.fps = fps;
        this.encoder = new MP4Encoder(canvas, { width, height, fps, bitrate });
    }

    async start(): Promise<void> {
        await this.encoder.start();
    }

    async encodeFrame(timestamp?: number): Promise<void> {
        await this.encoder.encodeFrame(timestamp);
    }

    async stop(): Promise<Blob> {
        return await this.encoder.stop();
    }

    getFrameCount(): number {
        return this.encoder.getFrameCount();
    }
}

export function isWebCodecsSupported(): boolean {
    return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}
