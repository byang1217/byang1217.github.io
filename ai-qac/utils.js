function extractJSONString(text) {
  // 尝试找出JSON的开始和结束位置
  const possibleStart = text.indexOf('{');
  const possibleArrayStart = text.indexOf('[');
  
  // 确定JSON开始的位置和类型
  let startPos;
  let isArray = false;
  
  if (possibleStart === -1 && possibleArrayStart === -1) {
    console.log("无法在文本中找到JSON数据");
    return null;
  } else if (possibleStart === -1) {
    startPos = possibleArrayStart;
    isArray = true;
  } else if (possibleArrayStart === -1) {
    startPos = possibleStart;
  } else {
    // 取较小的位置作为起始点
    startPos = Math.min(possibleStart, possibleArrayStart);
    isArray = startPos === possibleArrayStart;
  }
  
  // 寻找对应的结束括号
  const endChar = isArray ? ']' : '}';
  const startChar = isArray ? '[' : '{';
  
  let count = 0;
  let endPos = -1;
  
  for (let i = startPos; i < text.length; i++) {
    if (text[i] === startChar) {
      count++;
    } else if (text[i] === endChar) {
      count--;
      if (count === 0) {
        endPos = i;
        break;
      }
    }
  }
  
  if (endPos === -1) {
    console.log("JSON格式不完整或无法找到匹配的结束括号");
    return null;
  }
  
  // 提取JSON字符串
  return text.substring(startPos, endPos + 1);
}

function extractAndParseJSON(text) {
  const jsonStr = extractJSONString(text)
  try {
    // 解析JSON
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("JSON解析错误:", error);
    return null;
  }
}
