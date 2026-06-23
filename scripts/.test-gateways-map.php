<?php
function monitor_map_gateway_status(string $name, array $gwStatus): array {
    $status = strtolower(trim((string) ($gwStatus["status"] ?? ""));
    $substatus = strtolower(trim((string) ($gwStatus["substatus"] ?? "none")));
    $mapped = "unknown";
    if ($status === "down" || $substatus === "force_down" || $substatus === "down" || $substatus === "highloss" || $substatus === "highdelay") {
        $mapped = "down";
    } elseif ($substatus === "loss" || $substatus === "delay" || $substatus === "latency") {
        $mapped = "degraded";
    } elseif ($status === "online" || $substatus === "none" || $substatus === "") {
        $mapped = "online";
    }
    $delayRaw = trim((string) ($gwStatus["delay"] ?? ""));
    $lossRaw = trim((string) ($gwStatus["loss"] ?? ""));
    $latencyMs = null;
    if ($delayRaw !== "" && preg_match("/^([\d.]+)\s*ms$/i", $delayRaw, $m)) {
        $latencyMs = (int) round((float) $m[1]);
    }
    $lossPercent = null;
    if ($lossRaw !== "" && preg_match("/^([\d.]+)\s*%?$/", $lossRaw, $m)) {
        $lossPercent = round((float) $m[1], 1);
    }
    $entry = ["name" => $name, "status" => $mapped];
    if ($latencyMs !== null) { $entry["latency_ms"] = $latencyMs; }
    if ($lossPercent !== null) { $entry["loss_percent"] = $lossPercent; }
    return $entry;
}

$online = monitor_map_gateway_status("WAN", ["status" => "online", "substatus" => "none", "delay" => "18ms", "loss" => "0.0%"]);
assert($online["status"] === "online" && $online["latency_ms"] === 18);

$down = monitor_map_gateway_status("WAN", ["status" => "down", "substatus" => "down", "delay" => "0ms", "loss" => "100%"]);
assert($down["status"] === "down");

$deg = monitor_map_gateway_status("WAN", ["status" => "online", "substatus" => "loss", "delay" => "40ms", "loss" => "5%"]);
assert($deg["status"] === "degraded");

echo "mapping OK\n";
