# 配置子域名邮箱

::: warning 注意
子域名邮箱发送邮件可能无法发送邮件，建议使用主域名邮箱发送邮件，子域名邮箱仅用于接收邮件。

mail channel 已不被支持，下面参考中仅限收件部分。
:::

参考

- [配置子域名邮箱](https://github.com/dreamhunter2333/cloudflare_temp_email/issues/164#issuecomment-2082612710)

## 创建随机二级域名地址

如果你已经配置好了基础域名的收件路由，还可以让用户在创建邮箱时，自动生成随机二级域名地址，例如：

- 基础域名：`abc.com`
- 创建结果：`name@x7k2p9q1.abc.com`

这适合做收件隔离、降低地址被重复命中的概率。

在 `worker` 变量中增加：

```toml
RANDOM_SUBDOMAIN_DOMAINS = ["abc.com"]
RANDOM_SUBDOMAIN_LENGTH = 8
```

- `RANDOM_SUBDOMAIN_DOMAINS`：允许启用随机二级域名的基础域名列表
- `RANDOM_SUBDOMAIN_LENGTH`：随机串长度，范围 `1-63`，默认 `8`

> [!NOTE]
> 这个功能只是在“创建地址”时自动补一个随机二级域名。
>
> 它不会自动帮你创建 Cloudflare 侧的子域名收件路由或 DNS 配置，请先确保基础域名/子域名路由本身已经可用。

## 默认唯一四级域名模式

如果你已经提前在 Cloudflare Email Routing 里配置好一批固定的二级子域，例如：

- `alpha.example.com`
- `docs.example.com`
- `support.example.com`

那么可以把这些前缀放进 `DOMAIN_LABELS`，让系统默认创建四级域名地址：

- `neo@a4k9m2.alpha.example.com`
- `neo@m7q2x8.docs.example.com`

特点：

- 每个邮箱域名都会带一个 6 位字母数字串
- 纯数字或明显重复模式不会被使用
- 已经发过的邮箱域名会被永久记录，不会复用
- 后续即使删除了邮箱地址，也不会再次发同一个邮箱域名

这更适合“需要长期保持域名不重复”的场景。
