/**
 * Spine WebGL 渲染器 - 使用 Spine 3.8 运行时
 * 通过全局 spine 对象（从 script 标签加载）
 */

import { SpineFiles } from '../types';
import { createAssetUrls, revokeAssetUrls } from './spineLoader';

// 声明全局 spine 对象
declare var spine: any;

export class SpineRenderer {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  urls: Record<string, string> = {};

  // Spine 运行时对象
  shader: any = null;
  batcher: any = null;
  mvp: any = null;
  skeletonRenderer: any = null;
  shapeRenderer: any = null; // Debug

  skeleton: any = null;
  state: any = null;
  bounds: any = null;

  // 渲染状态
  lastTime: number = 0;
  requestId: number = 0;
  lastDebugLog: number = 0; // Debug throttle

  // 配置
  bgColor: number[] = [0, 0, 0, 0]; // 默认透明
  scale: number = 1.0;

  // Spine 3.8 兼容层
  spineWebGL: any = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,  // Spine 纹理通常是 PMA 格式
      preserveDrawingBuffer: true
    }) as WebGLRenderingContext;

    if (!gl) throw new Error('WebGL 不可用');
    this.gl = gl;

    // 启用混合 - PMA 模式使用 ONE, ONE_MINUS_SRC_ALPHA
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    if (typeof spine === 'undefined') {
      throw new Error('Spine 运行时未加载');
    }

    // Spine 3.8 使用 spine.webgl 命名空间
    this.spineWebGL = spine.webgl ? spine.webgl : spine;

    // 创建 Shader - 使用 TwoColoredTextured（官方推荐）
    this.shader = this.spineWebGL.Shader.newTwoColoredTextured(gl);

    // 创建 Batcher - 使用默认配置（启用 twoColorTint）
    this.batcher = new this.spineWebGL.PolygonBatcher(gl);

    // 创建 MVP 矩阵
    this.mvp = new this.spineWebGL.Matrix4();

    // 创建 SkeletonRenderer
    this.skeletonRenderer = new this.spineWebGL.SkeletonRenderer(gl);
    // PMA 模式
    if (typeof this.skeletonRenderer.premultipliedAlpha !== 'undefined') {
      this.skeletonRenderer.premultipliedAlpha = true;
    }
    console.log('[SpineRenderer] 初始化完成, premultipliedAlpha: true');
  }

  async load(files: SpineFiles): Promise<string[]> {
    // 清理之前的资源
    this.skeleton = null;
    this.state = null;
    this.bounds = null;
    revokeAssetUrls(this.urls);

    if (!files.skeleton || !files.atlas) {
      throw new Error('缺少骨骼文件或图集文件');
    }

    // 创建 Blob URLs
    this.urls = createAssetUrls(files);

    try {
      // 使用 Spine 的 AssetManager 来正确加载资源
      const assetManager = new this.spineWebGL.AssetManager(this.gl);

      // 自定义下载器，使用 Blob URL
      const originalLoad = assetManager.loadText.bind(assetManager);
      const originalLoadTexture = assetManager.loadTexture.bind(assetManager);

      // 加载 Atlas 文本
      const atlasUrl = this.urls[files.atlas.name];
      const atlasText = await fetch(atlasUrl).then(r => r.text());

      // 解析 Atlas 获取纹理文件名
      const textureNames: string[] = [];
      const lines = atlasText.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.endsWith('.png') || line.endsWith('.jpg')) {
          textureNames.push(line);
        }
      }

      // 预加载所有图片并创建 GLTexture
      const textureMap: Map<string, any> = new Map();
      const gl = this.gl;

      for (const texName of textureNames) {
        const blobUrl = this.urls[texName] || this.urls[texName.split('/').pop()!];

        if (!blobUrl) {
          console.warn(`纹理未找到: ${texName}`);
          continue;
        }

        // 加载图片
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.src = blobUrl;
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
        });
        // 创建带正确尺寸的 GLTexture
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);  // PMA

        const texture = new this.spineWebGL.GLTexture(gl, image);
        textureMap.set(texName, texture);
      }

      // 创建 TextureAtlas，同步返回已加载的纹理
      const atlas = new spine.TextureAtlas(atlasText, (path: string) => {
        const tex = textureMap.get(path);
        if (tex) {
          return tex;
        }

        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 2;
        return new this.spineWebGL.GLTexture(gl, canvas);
      });

      // 4. 加载骨骼数据
      const atlasLoader = new spine.AtlasAttachmentLoader(atlas);
      const skelUrl = this.urls[files.skeleton.name];

      let skeletonData;
      if (files.skeleton.name.endsWith('.json')) {
        const skeletonJson = new spine.SkeletonJson(atlasLoader);
        skeletonJson.scale = 1.0;
        const jsonContent = await fetch(skelUrl).then(r => r.json());
        skeletonData = skeletonJson.readSkeletonData(jsonContent);
      } else {
        const skeletonBinary = new spine.SkeletonBinary(atlasLoader);
        skeletonBinary.scale = 1.0;
        const buffer = await fetch(skelUrl).then(r => r.arrayBuffer());
        skeletonData = skeletonBinary.readSkeletonData(new Uint8Array(buffer));
      }

      // 5. 创建 Skeleton 和 AnimationState
      this.skeleton = new spine.Skeleton(skeletonData);
      this.skeleton.setToSetupPose();
      this.skeleton.updateWorldTransform();


      // 6. 计算边界
      const offset = new (this.spineWebGL.Vector2 || spine.Vector2)();
      const size = new (this.spineWebGL.Vector2 || spine.Vector2)();
      this.skeleton.getBounds(offset, size, []);

      this.bounds = { offset, size };
      // 7. 创建动画状态
      const animationStateData = new spine.AnimationStateData(skeletonData);
      this.state = new spine.AnimationState(animationStateData);

      const animNames = skeletonData.animations.map((a: any) => a.name);
      return animNames;
    } catch (e) {
      console.error('加载 Spine 资源失败:', e);
      throw e;
    }
  }

  setAnimation(animName: string, loop: boolean = true) {
    if (this.state && this.skeleton) {
      try {
        const entry = this.state.setAnimation(0, animName, loop);
        this.skeleton.setToSetupPose();

        // 立即更新一次以确保 duration 等信息可用
        this.totalTime = entry.animation.duration;
        this.currentTime = 0;
      } catch (e) {
        console.warn(`动画 ${animName} 未找到`);
      }
    }
  }

  seek(time: number) {
    if (this.state) {
      const track = this.state.getCurrent(0);
      if (track) {
        track.trackTime = time;
        this.currentTime = time;
        // Apply immediately to update pose
        this.state.apply(this.skeleton);
        this.skeleton.updateWorldTransform();
      }
    }
  }

  /**
   * 重置当前动画到开头
   */
  resetAnimation() {
    if (this.state) {
      const track = this.state.getCurrent(0);
      if (track) {
        track.trackTime = 0;
        this.currentTime = 0;
        this.state.apply(this.skeleton);
        this.skeleton.updateWorldTransform();
      }
    }
  }

  resize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  setBackgroundColor(hex: string) {
    if (hex === 'transparent') {
      this.bgColor = [0, 0, 0, 0];
      return;
    }
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const a = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1.0;
    this.bgColor = [r, g, b, a];
  }

  setScale(val: number) {
    this.scale = val;
  }

  // 播放控制
  isPlaying: boolean = true;
  timeScale: number = 1.0;
  private isRunning: boolean = false;

  // 帧率控制
  targetFPS: number = 60;
  private frameInterval: number = 1000 / 60;
  private lastFrameTime: number = 0;

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = Date.now();
    this.lastFrameTime = Date.now(); // 初始化帧时间
    this.renderLoop();
  }

  stop() {
    this.isRunning = false;
    cancelAnimationFrame(this.requestId);
  }

  // 暴露给外部的状态
  currentTime: number = 0;
  totalTime: number = 0;

  private renderLoop() {
    if (!this.isRunning) return;

    const now = Date.now();
    const elapsed = now - this.lastFrameTime;

    // 帧率限制: 只有当经过的时间超过帧间隔时才更新
    if (elapsed < this.frameInterval) {
      this.requestId = requestAnimationFrame(() => this.renderLoop());
      return;
    }

    // 计算实际的 delta,考虑帧率限制
    let delta = elapsed / 1000;
    this.lastFrameTime = now - (elapsed % this.frameInterval);

    // 限制最大 delta 防止卡顿时飞跃
    if (delta > 0.1) delta = 0;

    this.updateAndRender(delta);

    this.requestId = requestAnimationFrame(() => this.renderLoop());
  }

  /**
   * 手动渲染一帧 (用于导出)
   * @param delta 秒
   */
  public updateAndRender(delta: number) {
    const gl = this.gl;

    // 清除画布
    gl.clearColor(this.bgColor[0], this.bgColor[1], this.bgColor[2], this.bgColor[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);

    try {
      if (this.skeleton && this.state && this.bounds) {
        if (this.isPlaying) {
          // 更新动画时间
          this.state.update(delta * this.timeScale);
          this.state.apply(this.skeleton);
          this.skeleton.updateWorldTransform();
        }

        // Sync state for UI
        const track = this.state.getCurrent(0);
        if (track) {
          this.currentTime = track.trackTime % track.animation.duration;
          this.totalTime = track.animation.duration;
        }

        // 视口适配逻辑 (Contain 模式)
        const b = this.bounds;
        const contentW = b.size.x;
        const contentH = b.size.y;
        const centerX = b.offset.x + contentW / 2;
        const centerY = b.offset.y + contentH / 2;

        // 画布尺寸
        const canvasW = this.canvas.width;
        const canvasH = this.canvas.height;
        const canvasAspect = canvasW / canvasH;
        const contentAspect = contentW / contentH;

        let viewW, viewH;

        // Fit 逻辑: 确保内容完全可见
        if (canvasAspect > contentAspect) {
          // 画布更宽 -> 高度撑满，宽度自适应
          viewH = contentH;
          viewW = contentH * canvasAspect;
        } else {
          // 画布更高 -> 宽度撑满，高度自适应
          viewW = contentW;
          viewH = contentW / canvasAspect;
        }

        // 应用缩放系数
        const zoom = this.scale;
        viewW /= zoom;
        viewH /= zoom;

        // 计算视口左下角
        const x = centerX - viewW / 2;
        const y = centerY - viewH / 2;

        // 设置 MVP 投影
        this.mvp.ortho2d(x, y, viewW, viewH);

        // 渲染
        this.shader.bind();
        this.shader.setUniformi(this.spineWebGL.Shader.SAMPLER, 0);
        this.shader.setUniform4x4f(this.spineWebGL.Shader.MVP_MATRIX, this.mvp.values);

        this.batcher.begin(this.shader);
        this.skeletonRenderer.draw(this.batcher, this.skeleton);
        this.batcher.end();
        this.shader.unbind();

        const glError = gl.getError();
        if (glError !== gl.NO_ERROR) {
          console.error("WebGL Error:", glError);
        }
      }
    } catch (e) {
      console.error("Render Loop Error:", e);
      // Reset batcher state if it crashed while drawing
      if (this.batcher && this.batcher.isDrawing) {
        try { this.batcher.end(); } catch (e2) { }
      }
    }
  }

  setPaused(paused: boolean) {
    this.isPlaying = !paused;
  }

  setPlaybackRate(rate: number) {
    this.timeScale = rate;
  }

  setTargetFPS(fps: number) {
    this.targetFPS = fps;
    this.frameInterval = 1000 / fps;
    console.log(`目标帧率设置为: ${fps} FPS, 帧间隔: ${this.frameInterval.toFixed(2)}ms`);
  }

  dispose() {
    this.stop();
    revokeAssetUrls(this.urls);
    this.urls = {};
  }
}