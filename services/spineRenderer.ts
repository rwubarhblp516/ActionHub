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
  shapesShader: any = null; // Debug
  shapeRenderer: any = null; // Debug
  skeletonDebugRenderer: any = null; // Debug

  skeleton: any = null;
  state: any = null;
  bounds: any = null;
  globalBounds: any = null; // 资产全动作最大包围盒

  // 渲染状态
  lastTime: number = 0;
  requestId: number = 0;
  lastDebugLog: number = 0; // Debug throttle

  // 配置
  bgColor: number[] = [0, 1, 0, 1]; // 默认绿幕 #00FF00
  scale: number = 1.0;
  debugEnabled: boolean = false;
  private debugOptions = {
    drawBones: true,
    drawRegionAttachments: false,
    drawBoundingBoxes: true,
    drawMeshHull: false,
    drawMeshTriangles: false,
    drawPaths: false,
    drawClipping: false,
    drawSkeletonXY: false,
  };
  private setupPoseMode: boolean = false;
  private wasPlayingBeforeSetup: boolean = true;
  private attachmentDefaults = new WeakMap<any, { x: number; y: number; scaleX: number; scaleY: number; rotation: number }>();

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

    // Debug Renderers
    this.shapesShader = this.spineWebGL.Shader.newColored(gl);
    this.shapeRenderer = new this.spineWebGL.ShapeRenderer(gl);
    this.skeletonDebugRenderer = new this.spineWebGL.SkeletonDebugRenderer(gl);
    if (typeof this.skeletonDebugRenderer.premultipliedAlpha !== 'undefined') {
      this.skeletonDebugRenderer.premultipliedAlpha = true;
    }

    console.log('[SpineRenderer] 初始化完成, premultipliedAlpha: true');
  }

  async load(files: SpineFiles): Promise<string[]> {
    // 清理之前的资源
    this.skeleton = null;
    this.state = null;
    this.bounds = null;
    this.globalBounds = null;
    revokeAssetUrls(this.urls);

    if (!files.skeleton || !files.atlas) {
      throw new Error('缺少骨骼文件或图集文件');
    }

    // 创建 Blob URLs
    this.urls = createAssetUrls(files);

    try {
      // 使用 Spine 的 AssetManager 来正确加载资源
      const assetManager = new this.spineWebGL.AssetManager(this.gl);

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

      // 6. 创建动画状态
      const animationStateData = new spine.AnimationStateData(skeletonData);
      this.state = new spine.AnimationState(animationStateData);

      const animNames = skeletonData.animations.map((a: any) => a.name);

      // 加载完成后，立即计算全局最大边界，确保所有动作对齐
      this.computeGlobalBounds();

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
        this.setupPoseMode = false;

        // 立即更新一次以确保 duration 等信息可用
        this.totalTime = entry.animation.duration;
        this.currentTime = 0;

        // 优先使用全局边界以保持角色比例统一
        if (this.globalBounds) {
          this.bounds = this.globalBounds;
        } else {
          this.updateAnimationBounds(animName);
        }
      } catch (e) {
        console.warn(`动画 ${animName} 未找到`, e);
      }
    }
  }

  /**
   * 扫描全资产下所有动画的最大合集边界
   */
  private computeGlobalBounds() {
    if (!this.skeleton) return;

    const animations = this.skeleton.data.animations;
    if (!animations || animations.length === 0) return;

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    const offset = new (this.spineWebGL.Vector2 || spine.Vector2)();
    const size = new (this.spineWebGL.Vector2 || spine.Vector2)();

    console.log(`[SpineRenderer] 正在计算全动作对齐边界 (共 ${animations.length} 个动画)...`);

    for (const anim of animations) {
      const duration = anim.duration;
      const samples = duration > 0 ? 5 : 1;

      for (let i = 0; i <= samples; i++) {
        const time = (i / samples) * duration;
        // 3.8 的 apply 签名通常是: (skeleton, lastTime, time, loop, events, alpha, blend, direction)
        anim.apply(this.skeleton, 0, time, false, [], 1.0, 0, 0);
        this.skeleton.updateWorldTransform();
        this.skeleton.getBounds(offset, size, []);

        minX = Math.min(minX, offset.x);
        minY = Math.min(minY, offset.y);
        maxX = Math.max(maxX, offset.x + size.x);
        maxY = Math.max(maxY, offset.y + size.y);
      }
    }

    // 给全局边界 15% 的安全边距
    const width = maxX - minX;
    const height = maxY - minY;
    const paddingX = width * 0.15;
    const paddingY = height * 0.15;

    this.globalBounds = {
      offset: { x: minX - paddingX, y: minY - paddingY },
      size: { x: width + paddingX * 2, y: height + paddingY * 2 }
    };

    this.bounds = this.globalBounds;

    // 重置状态
    this.skeleton.setToSetupPose();
    this.skeleton.updateWorldTransform();
    console.log('[SpineRenderer] 全局对齐边界计算完成');
  }

  /**
   * 扫描单个动画全周期的最大包围盒
   */
  private updateAnimationBounds(animName: string) {
    if (!this.skeleton || !this.state) return;

    const animation = this.skeleton.data.findAnimation(animName);
    if (!animation) return;

    const duration = animation.duration;
    const samples = 15;

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    const offset = new (this.spineWebGL.Vector2 || spine.Vector2)();
    const size = new (this.spineWebGL.Vector2 || spine.Vector2)();

    const track = this.state.getCurrent(0);

    for (let i = 0; i <= samples; i++) {
      const time = (i / samples) * duration;
      animation.apply(this.skeleton, 0, time, false, [], 1.0, 0, 0);
      this.skeleton.updateWorldTransform();
      this.skeleton.getBounds(offset, size, []);

      minX = Math.min(minX, offset.x);
      minY = Math.min(minY, offset.y);
      maxX = Math.max(maxX, offset.x + size.x);
      maxY = Math.max(maxY, offset.y + size.y);
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const paddingX = width * 0.1;
    const paddingY = height * 0.1;

    this.bounds = {
      offset: { x: minX - paddingX, y: minY - paddingY },
      size: { x: width + paddingX * 2, y: height + paddingY * 2 }
    };

    if (track) {
      this.state.apply(this.skeleton);
      this.skeleton.updateWorldTransform();
    }
  }

  seek(time: number) {
    if (this.state && this.skeleton) {
      const track = this.state.getCurrent(0);
      if (track) {
        track.trackTime = time;
        this.currentTime = time;
        this.skeleton.setToSetupPose();
        this.state.apply(this.skeleton);
        this.skeleton.updateWorldTransform();
      }
    }
  }

  resetAnimation() {
    if (this.state && this.skeleton) {
      const track = this.state.getCurrent(0);
      if (track) {
        track.trackTime = 0;
        this.currentTime = 0;
        this.skeleton.setToSetupPose();
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
    this.lastFrameTime = Date.now();
    this.renderLoop();
  }

  stop() {
    this.isRunning = false;
    cancelAnimationFrame(this.requestId);
  }

  currentTime: number = 0;
  totalTime: number = 0;

  private renderLoop() {
    if (!this.isRunning) return;

    const now = Date.now();
    const elapsed = now - this.lastFrameTime;

    if (elapsed < this.frameInterval) {
      this.requestId = requestAnimationFrame(() => this.renderLoop());
      return;
    }

    let delta = elapsed / 1000;
    this.lastFrameTime = now - (elapsed % this.frameInterval);
    if (delta > 0.1) delta = 0.1;

    this.updateAndRender(delta);
    this.requestId = requestAnimationFrame(() => this.renderLoop());
  }

  public updateAndRender(delta: number) {
    const gl = this.gl;
    gl.clearColor(this.bgColor[0], this.bgColor[1], this.bgColor[2], this.bgColor[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);

    try {
      if (this.skeleton && this.state && this.bounds) {
        if (this.setupPoseMode) {
          this.skeleton.setToSetupPose();
          this.skeleton.updateWorldTransform();
          this.currentTime = 0;
          this.totalTime = 0;
        } else if (this.isPlaying) {
          this.state.update(delta * this.timeScale);
          this.skeleton.setToSetupPose();
          this.state.apply(this.skeleton);
          this.skeleton.updateWorldTransform();
        } else {
          // 暂停时也要以 setup pose 为基底，避免拖拽跳转/切动画时残留状态导致“变形”
          this.skeleton.setToSetupPose();
          this.state.apply(this.skeleton);
          this.skeleton.updateWorldTransform();
        }

        const track = this.state.getCurrent(0);
        if (track) {
          this.currentTime = track.trackTime % track.animation.duration;
          this.totalTime = track.animation.duration;
        }

        const b = this.bounds;
        const contentW = b.size.x;
        const contentH = b.size.y;
        const centerX = b.offset.x + contentW / 2;
        const centerY = b.offset.y + contentH / 2;

        const canvasW = this.canvas.width;
        const canvasH = this.canvas.height;
        const canvasAspect = canvasW / canvasH;
        const contentAspect = contentW / contentH;

        let viewW, viewH;

        if (canvasAspect > contentAspect) {
          viewH = contentH;
          viewW = contentH * canvasAspect;
        } else {
          viewW = contentW;
          viewH = contentW / canvasAspect;
        }

        const zoom = this.scale;
        viewW /= zoom;
        viewH /= zoom;

        const x = centerX - viewW / 2;
        const y = centerY - viewH / 2;

        this.mvp.ortho2d(x, y, viewW, viewH);

        this.shader.bind();
        this.shader.setUniformi(this.spineWebGL.Shader.SAMPLER, 0);
        this.shader.setUniform4x4f(this.spineWebGL.Shader.MVP_MATRIX, this.mvp.values);

        this.batcher.begin(this.shader);
        this.skeletonRenderer.draw(this.batcher, this.skeleton);
        this.batcher.end();
        this.shader.unbind();

        if (this.debugEnabled && this.shapeRenderer && this.shapesShader && this.skeletonDebugRenderer) {
          this.skeletonDebugRenderer.drawBones = this.debugOptions.drawBones;
          this.skeletonDebugRenderer.drawRegionAttachments = this.debugOptions.drawRegionAttachments;
          this.skeletonDebugRenderer.drawBoundingBoxes = this.debugOptions.drawBoundingBoxes;
          this.skeletonDebugRenderer.drawMeshHull = this.debugOptions.drawMeshHull;
          this.skeletonDebugRenderer.drawMeshTriangles = this.debugOptions.drawMeshTriangles;
          this.skeletonDebugRenderer.drawPaths = this.debugOptions.drawPaths;
          this.skeletonDebugRenderer.drawClipping = this.debugOptions.drawClipping;
          this.skeletonDebugRenderer.drawSkeletonXY = this.debugOptions.drawSkeletonXY;
          this.skeletonDebugRenderer.premultipliedAlpha = true;

          this.shapesShader.bind();
          this.shapesShader.setUniform4x4f(this.spineWebGL.Shader.MVP_MATRIX, this.mvp.values);
          this.shapeRenderer.begin(this.shapesShader);
          this.skeletonDebugRenderer.draw(this.shapeRenderer, this.skeleton, null);
          this.shapeRenderer.end();
          this.shapesShader.unbind();
        }
      }
    } catch (e) {
      console.error("Render Loop Error:", e);
      if (this.batcher && this.batcher.isDrawing) {
        try { this.batcher.end(); } catch (e2) { }
      }
    }
  }

  setPaused(paused: boolean) {
    this.isPlaying = !paused;
  }

  setSetupPoseMode(enabled: boolean) {
    if (!this.skeleton || !this.state) {
      this.setupPoseMode = enabled;
      return;
    }
    if (enabled === this.setupPoseMode) return;

    this.setupPoseMode = enabled;
    if (enabled) {
      this.wasPlayingBeforeSetup = this.isPlaying;
      this.isPlaying = false;
      if (typeof this.state.setEmptyAnimation === 'function') {
        this.state.setEmptyAnimation(0, 0);
      }
      this.skeleton.setToSetupPose();
      this.skeleton.updateWorldTransform();
      this.currentTime = 0;
      this.totalTime = 0;
    } else {
      this.isPlaying = this.wasPlayingBeforeSetup;
    }
  }

  setDebugEnabled(enabled: boolean) {
    this.debugEnabled = enabled;
  }

  setDebugOptions(options: Partial<typeof this.debugOptions>) {
    this.debugOptions = { ...this.debugOptions, ...options };
  }

  setPlaybackRate(rate: number) {
    this.timeScale = rate;
  }

  setTargetFPS(fps: number) {
    this.targetFPS = fps;
    this.frameInterval = 1000 / fps;
  }

  applyAttachmentOverrides(overrides: Record<string, { offset_x: number; offset_y: number; scale_x: number; scale_y: number; rotation: number }>) {
    if (!this.skeleton || !this.skeleton.data) return;
    const skins = this.skeleton.data.skins || [];
    const slots = this.skeleton.data.slots || [];

    skins.forEach((skin: any) => {
      const entries = skin.getAttachments ? skin.getAttachments() : [];
      entries.forEach((entry: any) => {
        const slotName = slots[entry.slotIndex]?.name || `slot_${entry.slotIndex}`;
        const key = `${slotName}::${entry.name}`;
        const attachment = entry.attachment;
        if (!attachment) return;

        const defaults = this.attachmentDefaults.get(attachment) || {
          x: attachment.x || 0,
          y: attachment.y || 0,
          scaleX: attachment.scaleX ?? 1,
          scaleY: attachment.scaleY ?? 1,
          rotation: attachment.rotation || 0,
        };
        this.attachmentDefaults.set(attachment, defaults);

        // reset to defaults before applying override
        attachment.x = defaults.x;
        attachment.y = defaults.y;
        attachment.scaleX = defaults.scaleX;
        attachment.scaleY = defaults.scaleY;
        attachment.rotation = defaults.rotation;

        const override = overrides[key];
        if (!override) return;
        attachment.x = defaults.x + (override.offset_x || 0);
        attachment.y = defaults.y + (override.offset_y || 0);
        attachment.scaleX = defaults.scaleX * (override.scale_x || 1);
        attachment.scaleY = defaults.scaleY * (override.scale_y || 1);
        attachment.rotation = defaults.rotation + (override.rotation || 0);
      });
    });

    this.skeleton.setToSetupPose();
    this.skeleton.updateWorldTransform();
  }

  dispose() {
    this.stop();
    revokeAssetUrls(this.urls);
    this.urls = {};
  }
}
