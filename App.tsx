import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { useRef, useState } from "react";
import { Button, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const vertexShaderSource = `
attribute vec4 position;
attribute vec2 textureCoord;
varying vec2 vTextureCoord;

void main() {
  gl_Position = position;
  vTextureCoord = textureCoord;
}`;

const fragmentShaderSource = `
precision mediump float;
varying vec2 vTextureCoord;
uniform sampler2D texture;
uniform vec2 resolution;
uniform int visionMode;

vec4 catVision(vec4 color) {
  // 调整色彩敏感度，增强蓝绿色
  color.r *= 0.7;
  color.g *= 1.2;
  color.b *= 1.1;
  
  // 提高亮度以模拟夜视能力
  float brightness = (color.r + color.g + color.b) / 3.0;
  color.rgb = mix(color.rgb, vec3(brightness), 0.2);
  
  // 添加轻微的模糊效果以模拟较低的视觉清晰度
  vec2 pixelSize = 1.0 / resolution.xy;
  vec4 blur = vec4(0.0);
  for(int i = -1; i <= 1; i++) {
    for(int j = -1; j <= 1; j++) {
      vec2 offset = vec2(float(i), float(j)) * pixelSize;
      blur += texture2D(texture, vTextureCoord + offset);
    }
  }
  blur /= 9.0;
  
  return mix(color, blur, 0.2);
}

vec4 dogVision(vec4 color) {
    // 将颜色转换为二色视觉（主要是蓝色和黄色）
  float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  float blue = (color.b * 0.7 + gray * 0.3);
  float yellow = (color.r * 0.4 + color.g * 0.6) * 0.7 + gray * 0.3;
  color.rgb = vec3(yellow, yellow, blue);
  
  // 增强边缘检测以模拟对运动的敏感性
  vec2 pixelSize = 1.0 / resolution.xy;
  vec4 h = texture2D(texture, vTextureCoord + vec2(pixelSize.x, 0.0)) - texture2D(texture, vTextureCoord - vec2(pixelSize.x, 0.0));
  vec4 v = texture2D(texture, vTextureCoord + vec2(0.0, pixelSize.y)) - texture2D(texture, vTextureCoord - vec2(0.0, pixelSize.y));
  float edge = length(h) + length(v);
  
  color.rgb = mix(color.rgb, vec3(1.0), edge * 2.0);
  
  // 降低中心视力清晰度
  vec2 center = vTextureCoord - 0.5;
  float dist = length(center);
  float blur = smoothstep(0.0, 0.5, dist);
  color.rgb = mix(color.rgb, vec3(gray), blur * 0.5);
  
  return color;
}

vec4 parrotVision(vec4 color) {
  // 增强色彩饱和度
  vec3 luminance = vec3(0.299, 0.587, 0.114);
  float lum = dot(color.rgb, luminance);
  color.rgb = mix(vec3(lum), color.rgb, 1.5);
  
  // 添加模拟的紫外线通道
  float uv_intensity = (color.r * 0.3 + color.g * 0.4 + color.b * 0.3);
  vec3 uv_color = vec3(0.8, 0.0, 1.0); // 用紫色代表紫外线
  color.rgb = mix(color.rgb, uv_color, uv_intensity * 0.3);
  
  // 扩展色域以模拟四色视觉
  color.r = pow(color.r, 0.8);
  color.g = pow(color.g, 0.9);
  color.b = pow(color.b, 0.7);
  
  // 增加对比度以模拟更宽的色域
  color.rgb = (color.rgb - 0.5) * 1.2 + 0.5;
  
  return color;
}

void main() {
  vec2 flippedCoord = vTextureCoord;
  
  vec4 color = texture2D(texture, flippedCoord);
  vec4 finalColor = color;

  if (visionMode == 0) {
    finalColor = catVision(color);
  } else if (visionMode == 1) {
    finalColor = dogVision(color);
  } else if (visionMode == 2) {
    finalColor = parrotVision(color);
  }

  gl_FragColor = finalColor;
}
`;

type AnimalType = "cat" | "dog" | "parrot";

export default function App() {
  const [facing, setFacing] = useState<CameraType>("back");
  const [permission, requestPermission] = useCameraPermissions();
  // const [animalVision, setAnimalVision] = useState<AnimalType>("cat");
  const animalVision = useRef<AnimalType>("cat");
  const cameraRef = useRef<CameraView>(null);
  const glViewRef = useRef<GLView>(null);

  if (!permission) {
    // Camera permissions are still loading.
    return <View />;
  }

  if (!permission.granted) {
    // Camera permissions are not granted yet.
    return (
      <View style={styles.container}>
        <Text style={styles.message}>
          We need your permission to show the camera
        </Text>
        <Button onPress={requestPermission} title="grant permission" />
      </View>
    );
  }

  function toggleCameraFacing() {
    setFacing((current) => (current === "back" ? "front" : "back"));
  }

  const onContentCreate = async (gl: ExpoWebGLRenderingContext) => {
    // 设置视口
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

    // 初始化摄像头纹理
    const cameraTexture = await glViewRef.current?.createCameraTextureAsync(
      cameraRef.current!
    );

    const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vertexShader, vertexShaderSource);
    gl.compileShader(vertexShader);

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fragmentShader, fragmentShaderSource);
    gl.compileShader(fragmentShader);

    const program = gl.createProgram()!;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.useProgram(program);

    // 创建顶点缓冲区
    const vertices = new Float32Array([
      -1.0,
      -1.0,
      0.0,
      1.0,
      1.0, // 左下角 (X 和 Y 轴翻转)
      1.0,
      -1.0,
      0.0,
      0.0,
      1.0, // 右下角 (X 和 Y 轴翻转)
      -1.0,
      1.0,
      0.0,
      1.0,
      0.0, // 左上角 (X 和 Y 轴翻转)
      1.0,
      1.0,
      0.0,
      0.0,
      0.0, // 右上角 (X 和 Y 轴翻转)
    ]);

    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 5 * 4, 0);

    const textureCoord = gl.getAttribLocation(program, "textureCoord");
    gl.enableVertexAttribArray(textureCoord);
    gl.vertexAttribPointer(textureCoord, 2, gl.FLOAT, false, 5 * 4, 3 * 4);

    // 设置纹理参数
    gl.bindTexture(gl.TEXTURE_2D, cameraTexture!);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // 传递动物视觉模式参数
    const visionModeLocation = gl.getUniformLocation(program, "visionMode");
    const visionModes = {
      cat: 0,
      dog: 1,
      parrot: 2,
    };
    const resolution = gl.getUniformLocation(program, "resolution");

    // 渲染循环
    const loop = () => {
      gl.clearColor(0.0, 0.0, 0.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      // 绑定纹理
      gl.bindTexture(gl.TEXTURE_2D, cameraTexture!);

      // 设定当前视觉模式
      gl.uniform1i(visionModeLocation, visionModes[animalVision.current]);

      gl.uniform2f(resolution, gl.drawingBufferWidth, gl.drawingBufferHeight);

      // 绘制三角形
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // 结束绘制并请求下一帧
      gl.endFrameEXP();
      requestAnimationFrame(loop);
    };

    loop();
  };

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing={facing} ref={cameraRef}>
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.button} onPress={toggleCameraFacing}>
            <Text style={styles.text}>Flip Camera</Text>
          </TouchableOpacity>
        </View>
      </CameraView>

      <View style={{ flex: 1, position: "relative" }}>
        <GLView
          style={{ flex: 1 }}
          ref={glViewRef}
          onContextCreate={onContentCreate}
        />
        <View
          style={[
            styles.buttonContainer,
            {
              position: "absolute",
              right: 0,
              left: 0,
              bottom: 20,
              gap: 10,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.button}
            onPress={() => (animalVision.current = "cat")}
          >
            <Text style={styles.text}>🐱</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            onPress={() => (animalVision.current = "dog")}
          >
            <Text style={styles.text}>🐶</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            onPress={() => (animalVision.current = "parrot")}
          >
            <Text style={styles.text}>🦜</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
  },
  message: {
    textAlign: "center",
    paddingBottom: 10,
  },
  camera: {
    flex: 1,
  },
  buttonContainer: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    backgroundColor: "transparent",
    margin: 64,
  },
  button: {
    alignSelf: "flex-end",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    padding: 10,
    borderRadius: 10,
  },
  text: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
  },
});
