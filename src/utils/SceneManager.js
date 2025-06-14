import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

export class SceneManager {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.setupScene();
  }

  setupScene() {
    // 移除默认背景色，使用透明背景
    this.scene.background = null;

    // 添加光源
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);

    // 添加方向光
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    directionalLight.castShadow = true;

    // 设置阴影属性
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    this.scene.add(directionalLight);

    // 添加辅助光源
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-5, 5, -5);
    this.scene.add(fillLight);
  }

  async loadModel(modelPath, onProgress) {
    console.log("开始加载模型:", modelPath);

    const loader = new GLTFLoader();
    loader.manager.onError = (url) => {
      console.error("资源加载失败:", url);
    };

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderConfig({ type: "js" }); // 使用JavaScript解码器

    const DRACO_PATHS = [
      "https://www.gstatic.com/draco/v1/decoders/",
      "https://cdn.jsdelivr.net/npm/three@0.150.0/examples/js/libs/draco/",
      "/draco/",
    ];

    // 尝试设置Draco解码器路径
    let dracoPathSet = false;
    for (const path of DRACO_PATHS) {
      try {
        console.log("尝试使用Draco解码器路径:", path);
        dracoLoader.setDecoderPath(path);
        dracoPathSet = true;
        console.log("成功设置Draco解码器路径:", path);
        break;
      } catch (error) {
        console.warn(`Draco解码器路径 ${path} 不可用:`, error);
      }
    }

    if (!dracoPathSet) {
      console.warn("所有Draco解码器路径都不可用，将尝试不使用Draco加载模型");
    }

    loader.setDRACOLoader(dracoLoader);

    try {
      const gltf = await new Promise((resolve, reject) => {
        const timeoutDuration = 30000; // 30秒超时
        let timeoutId = null;

        const cleanup = () => {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
        };

        const handleSuccess = (gltf) => {
          cleanup();
          console.log("模型加载成功:", modelPath);
          if (!gltf.scene) {
            reject(new Error("加载的模型没有场景对象"));
            return;
          }
          resolve(gltf);
        };

        const handleProgress = (event) => {
          if (onProgress && typeof onProgress === "function") {
            try {
              console.log(
                "加载进度:",
                Math.round(event.loaded / 1024),
                "KB /",
                event.total
                  ? Math.round(event.total / 1024) + "KB"
                  : "未知大小",
                event.lengthComputable
                  ? `(${Math.round((event.loaded / event.total) * 100)}%)`
                  : ""
              );
              onProgress(event);
            } catch (error) {
              console.warn("进度回调执行失败:", error);
            }
          }
        };

        const handleError = (error) => {
          cleanup();
          console.error("模型加载失败:", error);
          console.error("模型路径:", modelPath);
          reject(new Error(`模型加载失败: ${error.message || "未知错误"}`));
        };

        loader.load(modelPath, handleSuccess, handleProgress, handleError);

        // 设置加载超时
        timeoutId = setTimeout(() => {
          console.error("模型加载超时:", modelPath);
          reject(new Error("模型加载超时"));
        }, timeoutDuration);
      });

      if (!gltf.scene) {
        throw new Error("加载的模型没有场景对象");
      }

      console.log("成功获取模型场景对象");
      return gltf.scene;
    } catch (error) {
      console.error("模型加载过程出错:", error);
      throw error;
    } finally {
      dracoLoader.dispose();
    }
  }

  // 递归处理模型属性
  traverseModel(object) {
    if (!object) return;

    // 设置模型及其子元素为可交互
    object.userData = object.userData || {};
    object.userData.clickable = true;

    // 递归处理子对象
    if (object.children && object.children.length > 0) {
      object.children.forEach((child) => this.traverseModel(child));
    }
  }

  // 递归清理资源但保留交互性
  disposeObject(object) {
    if (!object) return;

    // 保存交互相关的属性
    const userData = object.userData;
    const clickable = object.userData?.clickable;

    // 递归处理子对象
    if (object.children && object.children.length > 0) {
      object.children.forEach((child) => this.disposeObject(child));
    }

    // 释放几何体
    if (object.geometry) {
      object.geometry.dispose();
    }

    // 释放材质
    if (object.material) {
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => {
          if (material.map) material.map.dispose();
          if (material.lightMap) material.lightMap.dispose();
          if (material.bumpMap) material.bumpMap.dispose();
          if (material.normalMap) material.normalMap.dispose();
          if (material.specularMap) material.specularMap.dispose();
          if (material.envMap) material.envMap.dispose();
          material.dispose();
        });
      } else {
        if (object.material.map) object.material.map.dispose();
        if (object.material.lightMap) object.material.lightMap.dispose();
        if (object.material.bumpMap) object.material.bumpMap.dispose();
        if (object.material.normalMap) object.material.normalMap.dispose();
        if (object.material.specularMap) object.material.specularMap.dispose();
        if (object.material.envMap) object.material.envMap.dispose();
        object.material.dispose();
      }
    }

    // 恢复交互相关的属性
    object.userData = userData;
    if (clickable) {
      object.userData.clickable = clickable;
    }
  }

  addObject(object) {
    // 添加对象前设置交互属性
    this.traverseModel(object);
    this.scene.add(object);
  }

  removeObject(object) {
    if (!object) return;
    this.scene.remove(object);
  }

  clear() {
    // 清理场景中的所有对象
    while (this.scene.children.length > 0) {
      const object = this.scene.children[0];
      this.removeObject(object);
    }
  }

  dispose() {
    this.clear();
    this.scene = null;
    console.log("场景管理器已完全释放");
  }
}
