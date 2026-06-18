# 爬虫优化说明

**优化时间**：2026年6月9日  
**优化内容**：品牌识别和促销信息抓取

---

## 优化背景

用户反馈的问题：
1. **品牌识别不准确** - 很多品牌在搜索列表页不显示，需要进入详情页找到 Store 才能知道品牌
2. **促销信息不准确** - Limited Time Deal 和 Coupon 抓取有遗漏

## 优化内容

### 1. 品牌识别优化

#### 问题分析
- 搜索列表页只能通过标题第一个词推测品牌（`inferBrand`），准确率低
- 详情页采集虽然可以提取真实品牌，但不是所有产品都进详情页

#### 优化方案
**详情页品牌提取优先级调整**（`product-detail-parser.ts`）：

```typescript
function findBrandText(): string | null {
  // 1. 优先从 Store 链接提取（最准确）
  const storeLink = document.querySelector<HTMLAnchorElement>('#bylineInfo[href*="/stores/"], a[href*="/stores/"]');
  if (storeLink) {
    const storeBrand = cleanBrand(storeLink.innerText || storeLink.textContent);
    if (storeBrand) return storeBrand;
  }

  // 2. 从 byline 元素提取
  // 3. 从产品详情表格提取（包括 Manufacturer）
}
```

**改进点：**
- ✅ 优先查找 Store 链接（Amazon 品牌官方页面）
- ✅ 增加 "Manufacturer" 字段识别
- ✅ 清理品牌名称时移除 "Visit the" 和 "Store" 等无关文本

**详情页采集策略**（`detail-collector.ts`）：

当前配置：
- `bestSellerDetailTopN`: 默认前 **50** 名进详情页
- `bestSellerPromoDetailTopN`: 默认前 **30** 名采集促销
- `maxDetailProducts`: 最多 **9999** 个（实际由搜索结果限制）

可通过环境变量调整：
```bash
# 增加详情页采集范围（建议值）
AMAZON_BESTSELLER_DETAIL_TOP_N=100
AMAZON_BESTSELLER_PROMO_DETAIL_TOP_N=50
```

### 2. 促销信息优化

#### Coupon 识别增强

**新增正则模式**（`couponPatterns`）：

```typescript
// 原有（4个模式）
/\bSave\s+...with\s+coupon\b/i
/\b(?:Apply|Clip)\s+...coupon\b/i
/\b...\s+(?:off\s+)?coupon\b/i
/\bclip\s+coupon\b/i

// 新增（4个模式）
/\bExtra\s+...off\s+(?:with\s+)?coupon\b/i           // Extra 优惠
/\bSave\s+...coupon\b/i                               // 简化格式
/\bcoupon\s+applied\s+...at\s+checkout\b/i          // 自动应用
/\b...\s+coupon\s+applied\b/i                        // 已应用
```

**新增 DOM 选择器**：

搜索列表页：
```typescript
'[data-a-badge-type="coupon"]',    // Badge 类型标记
'.a-color-price',                   // 价格颜色标记
'.savingsPercentage'                // 折扣百分比
```

详情页：
```typescript
'#applicablePromotionList',         // 促销列表
'#corePrice_desktop .savingsPercentage',
'#corePrice_desktop .a-color-price',
'[data-a-badge-type="coupon"]'
```

#### Deal Badge 识别增强

**新增正则模式**（`dealPatterns`）：

```typescript
// 原有（2个模式）
/\b(?:limited\s+time\s+deal|prime\s+exclusive\s+deal|...)\b/i
/^deal$/i

// 新增（5个模式）
/\btoday'?s\s+deals?\b/i                              // Today's Deals
/\b(?:hot\s+deal|special\s+deal|limited\s+offer)\b/i // 其他活动类型
/\bSave\s+[\d.]+%\s+(?:on\s+)?...\b/i               // Save X%
/\blimited\s+time\b/i                                 // Limited Time（简化）
/^deal$/i                                             // Deal（独立）
```

**新增 DOM 选择器**：

搜索列表页：
```typescript
'[data-a-badge-type="deal"]',
'.dealBadge'
```

详情页：
```typescript
'#dealsAccordionRow',              // Deals 区域
'.dealBadge',
'[class*="badge"]',                // 所有 badge
'[data-a-badge-type="deal"]'
```

### 3. 货币符号支持扩展

#### 原有支持
- USD ($)
- HKD

#### 新增支持
- ✅ CAD (加元)
- ✅ AUD (澳元)
- ✅ GBP (£)
- ✅ EUR (€)
- ✅ JPY (¥)

**优化后的货币识别逻辑**：

```typescript
function inferCurrency(value: string): string {
  // 1. 优先识别货币代码（CAD, AUD, GBP, EUR, JPY）
  // 2. 然后识别货币符号（$, £, €, ¥）
  // 3. 默认返回 $ (USD)
}
```

---

## 优化效果

### 品牌识别
- ✅ **准确率提升** - 优先从 Store 链接提取品牌
- ✅ **覆盖率提升** - 识别更多品牌字段（Manufacturer）
- ✅ **清洗改进** - 移除 "Visit the", "Store" 等无关文本

### 促销信息
- ✅ **Coupon 识别** - 从 4 个模式扩展到 8 个模式
- ✅ **Deal 识别** - 从 2 个模式扩展到 6 个模式
- ✅ **DOM 覆盖** - 增加更多选择器，覆盖不同页面布局

### 国际化支持
- ✅ **货币支持** - 从 2 种扩展到 7 种货币
- ✅ **正则优化** - 所有促销正则支持多货币符号

---

## 调优建议

### 如果品牌仍然缺失

**方案 1：增加详情页采集数量**

```bash
# .env 文件或环境变量
AMAZON_BESTSELLER_DETAIL_TOP_N=100          # 前100名进详情页
AMAZON_BESTSELLER_PROMO_DETAIL_TOP_N=100    # 前100名采集促销
AMAZON_COLLECT_DETAIL_CONCURRENCY=5         # 并发数5（加快速度）
```

**方案 2：强制所有产品进详情页**

修改 `detail-collector.ts` 中的 `shouldCollectBestSellerDetails` 函数：

```typescript
function shouldCollectBestSellerDetails(product: BestSellerProductInput): boolean {
  // 原逻辑：只有部分产品进详情页
  // 修改为：所有产品都进详情页
  return true;
}
```

⚠️ **注意**：这会显著增加采集时间和被 Amazon 限流的风险。

### 如果促销信息仍然缺失

**调试步骤：**

1. **检查失败截图**
   ```bash
   # 查看采集失败时的截图
   ls E:\Program\Amazon\data\collector-screenshots\
   ```

2. **查看实际 DOM 结构**
   - 手动访问有促销的产品
   - 打开开发者工具（F12）
   - 查找 Coupon/Deal 相关的 HTML 元素
   - 将选择器添加到对应的 parser

3. **增加日志输出**
   在 `product-detail-parser.ts` 的 `findPromoText` 函数中添加：
   ```typescript
   console.log('[DEBUG] Coupon candidates:', candidates);
   console.log('[DEBUG] Deal candidates:', candidates);
   ```

### 性能优化

如果采集速度慢：

```bash
# 增加并发数
AMAZON_COLLECT_DETAIL_CONCURRENCY=5          # 默认 3

# 减少等待时间
AMAZON_COLLECT_DETAIL_TIMEOUT_MS=10000       # 默认 15000
AMAZON_COLLECT_DETAIL_SETTLE_MS=200          # 默认 300
```

---

## 测试验证

### 手动测试

1. **启动服务**
   ```bash
   npm start
   ```

2. **触发采集**
   - 访问 http://localhost:4000
   - 点击"采集全部"或"采集当前"
   - 等待采集完成

3. **检查结果**
   - 查看产品列表中的品牌字段
   - 查看 couponText 和 dealBadge 字段
   - 对比之前的数据

### CLI 测试

```bash
# 采集关键词
npm run collect:keyword

# 采集类目
npm run collect:category

# 采集全部
npm run collect
```

### 数据库查询

```sql
-- 查看品牌缺失率
SELECT 
  COUNT(*) as total,
  COUNT(brand) as has_brand,
  ROUND(COUNT(brand) * 100.0 / COUNT(*), 2) as brand_rate
FROM search_snapshots;

-- 查看促销信息覆盖率
SELECT 
  COUNT(*) as total,
  COUNT(coupon_text) as has_coupon,
  COUNT(deal_badge) as has_deal,
  ROUND(COUNT(coupon_text) * 100.0 / COUNT(*), 2) as coupon_rate,
  ROUND(COUNT(deal_badge) * 100.0 / COUNT(*), 2) as deal_rate
FROM search_snapshots;
```

---

## 相关文件

**解析器：**
- `apps/api/src/amazon/parsers/search-card-parser.ts` - 搜索列表页解析
- `apps/api/src/amazon/parsers/product-detail-parser.ts` - 详情页解析

**采集器：**
- `apps/api/src/amazon/detail-collector.ts` - 详情页采集逻辑
- `apps/api/src/amazon/search-collector.ts` - 搜索页采集逻辑

**配置：**
- `apps/api/src/amazon/config.ts` - 采集配置
- `.env.example` - 环境变量示例

---

## 已知限制

1. **Amazon 反爬虫**
   - 详情页采集过多可能触发验证码
   - 建议适度增加采集范围，不要全部进详情页

2. **页面结构变化**
   - Amazon 会不定期调整页面结构
   - 需要定期更新选择器和正则表达式

3. **促销信息的多样性**
   - 促销文案格式多样，无法 100% 覆盖
   - 建议持续收集新的促销格式并更新正则

---

## 后续改进方向

1. **AI 辅助提取**
   - 使用 LLM 从页面文本中提取品牌和促销信息
   - 更灵活，不依赖固定选择器

2. **增量采集**
   - 首次采集进详情页
   - 后续采集使用缓存，只对变化的产品进详情页

3. **分布式采集**
   - 使用代理池分散请求
   - 降低被限流的风险

4. **机器学习识别**
   - 训练模型识别品牌和促销信息
   - 适应 Amazon 页面变化

---

**优化完成时间**：2026年6月9日  
**构建状态**：✅ 编译通过  
**测试状态**：⏳ 待用户验证
