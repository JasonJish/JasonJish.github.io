# check.ps1 - index.html 의 내용 블록(두 --- 줄 사이)에 문법(YAML) 오류가 있는지 검사한다.
#
#   .\_tools\check.ps1
#
# 페이지가 하얗게 나오거나, 고쳤는데 바뀌지 않을 때 돌린다. 문제가 있으면 몇 번째 줄인지와
# 그 주변 줄을 보여 준다. 파일은 읽기만 하고 고치지 않는다. (Jekyll 이 쓰는 Ruby 로 검사한다.)
param([string]$File = "")
$site = Split-Path $PSScriptRoot
if (-not $File) { $File = Join-Path $site "index.html" }

$ruby = (Get-Command ruby -ErrorAction SilentlyContinue).Source
if (-not $ruby) { $ruby = Get-ChildItem "C:\Ruby*-x64\bin\ruby.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName }
if (-not $ruby) { Write-Host "Ruby 를 찾지 못했습니다. (Jekyll 을 실행하는 터미널에서 다시 해 보세요)" -ForegroundColor Yellow; exit 2 }

# Ruby 는 줄 번호만 돌려준다 (한글 출력은 PowerShell 이 맡는다).
$code = @'
require 'yaml'
require 'date'
s = File.read(ARGV[0], encoding: 'bom|utf-8')
m = s.match(/\A---[ \t]*\r?\n(.*?\r?\n)---[ \t]*\r?$/m)
if m.nil? then puts 'NOFM'; exit end
fm = m[1]; lines = fm.lines
load = lambda { |t| YAML.safe_load(t, permitted_classes: [Date, Time], aliases: true) }
begin
  load.call(fm); puts 'OK'
rescue Psych::SyntaxError => e
  ctx = e.line; bad = nil
  ([ctx - 1, 1].max..lines.size).each do |n|
    begin
      load.call(lines[0, n].join)
    rescue Psych::SyntaxError
      bad = n; break
    end
  end
  puts ['ERR', (bad || ctx) + 1, ctx + 1, e.problem.to_s, e.context.to_s].join('|')
end
'@
$out = ($code | & $ruby - $File 2>&1 | Select-Object -Last 1)

$text = [IO.File]::ReadAllLines($File, [Text.Encoding]::UTF8)
function Show-Lines([int]$at, [int]$before, [int]$after) {
  $from = [Math]::Max(1, $at - $before); $to = [Math]::Min($text.Length, $at + $after)
  for ($i = $from; $i -le $to; $i++) {
    $line = $text[$i - 1]; if ($line.Length -gt 150) { $line = $line.Substring(0, 150) + " ..." }
    $shown = $line -replace "`t", "[TAB]"
    if ($i -eq $at) { Write-Host (">> {0,5} | {1}" -f $i, $shown) -ForegroundColor Red } else { Write-Host ("   {0,5} | {1}" -f $i, $shown) }
  }
}

# 탭 문자는 YAML 들여쓰기에 쓸 수 없다: 내용 블록 안에서만 찾는다.
$end = 0; for ($i = 1; $i -lt $text.Length; $i++) { if ($text[$i] -match '^---\s*$') { $end = $i; break } }
$tabs = @(); for ($i = 0; $i -lt $end; $i++) { if ($text[$i] -match "^\s*`t") { $tabs += ($i + 1) } }

if ($out -eq 'OK' -and -not $tabs) { Write-Host "문법 이상 없음: index.html 의 내용 블록을 읽을 수 있습니다." -ForegroundColor Green; exit 0 }
if ($out -eq 'NOFM') { Write-Host "맨 위와 맨 아래의 --- 줄을 찾지 못했습니다. 첫 줄이 --- 인지, 내용 끝에 --- 줄이 있는지 확인하세요." -ForegroundColor Red; exit 1 }

if ($tabs) {
  Write-Host ("들여쓰기에 탭 문자가 있는 줄: {0}  ->  탭을 공백으로 바꾸세요 (두 칸 단위)." -f ($tabs -join ', ')) -ForegroundColor Red
  Show-Lines $tabs[0] 1 1; Write-Host ""
}
if ($out -like 'ERR|*') {
  $p = $out -split '\|'; $bad = [int]$p[1]; $ctx = [int]$p[2]
  Write-Host ("문법 오류: {0} 번째 줄 근처  ({1} {2})" -f $bad, $p[3], $p[4]) -ForegroundColor Red
  Write-Host ""
  Show-Lines $bad 6 3
  Write-Host ""
  if ($ctx -ne $bad) { Write-Host ("이 줄이 속한 묶음은 {0} 번째 줄에서 시작합니다." -f $ctx) }
  Write-Host "자주 있는 원인:"
  Write-Host "  1. 들여쓰기 한 칸 차이 - 같은 목록의 '- file:' 줄들은 정확히 같은 칸에서 시작해야 합니다 (위아래 줄과 비교)."
  Write-Host "  2. 값 안에 ': '(콜론+공백)이나 ' #' 이 있는데 큰따옴표로 감싸지 않았습니다."
  Write-Host "  3. 따옴표를 열고 닫지 않았습니다."
  exit 1
}
if ($out -ne 'OK') { Write-Host "검사를 실행하지 못했습니다: $out" -ForegroundColor Yellow; exit 2 }
exit 1
