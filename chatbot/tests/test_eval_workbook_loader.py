import zipfile
from pathlib import Path

from evals.load_qa_workbook import load_test_cases


def _write_minimal_xlsx(path: Path):
    workbook = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Test Cases" sheetId="1" r:id="rId1"/></sheets>
</workbook>"""
    rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>"""
    sheet = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>ID</t></is></c>
      <c r="B1" t="inlineStr"><is><t>Category</t></is></c>
      <c r="C1" t="inlineStr"><is><t>Test Question</t></is></c>
      <c r="D1" t="inlineStr"><is><t>Passing Criteria / Expected Response</t></is></c>
      <c r="E1" t="inlineStr"><is><t>Risk Level</t></is></c>
      <c r="F1" t="inlineStr"><is><t>Expected Model Path</t></is></c>
      <c r="G1" t="inlineStr"><is><t>Data Dependency</t></is></c>
      <c r="H1" t="inlineStr"><is><t>What This Tests</t></is></c>
    </row>
    <row r="2">
      <c r="A2" t="inlineStr"><is><t>C1</t></is></c>
      <c r="B2" t="inlineStr"><is><t>Course Retrieval</t></is></c>
      <c r="C2" t="inlineStr"><is><t>What is CS 1114?</t></is></c>
      <c r="D2" t="inlineStr"><is><t>Returns correct course.</t></is></c>
      <c r="E2" t="inlineStr"><is><t>Medium</t></is></c>
      <c r="F2" t="inlineStr"><is><t>RAG</t></is></c>
      <c r="G2" t="inlineStr"><is><t>Internal DB</t></is></c>
      <c r="H2" t="inlineStr"><is><t>Exact course lookup</t></is></c>
    </row>
  </sheetData>
</worksheet>"""
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("xl/workbook.xml", workbook)
        zf.writestr("xl/_rels/workbook.xml.rels", rels)
        zf.writestr("xl/worksheets/sheet1.xml", sheet)


def test_load_test_cases_from_xlsx(tmp_path):
    path = tmp_path / "qa.xlsx"
    _write_minimal_xlsx(path)
    cases = load_test_cases(path)
    assert len(cases) == 1
    assert cases[0].id == "C1"
    assert cases[0].question == "What is CS 1114?"
