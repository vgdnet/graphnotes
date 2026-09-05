from app.services.github import folder_note_path, split_tree_entries


def test_split_tree_entries_keeps_nested_md_and_gitlinks() -> None:
    blobs, gitlinks = split_tree_entries(
        [
            {"path": "Читай меня.md", "type": "blob", "sha": "111"},
            {"path": "GraphNotes", "type": "commit", "mode": "160000", "sha": "abc"},
            {"path": ".obsidian/app.json", "type": "blob", "sha": "hid"},
            {"path": "вариант А — карточки/Паранойя (А).md", "type": "blob", "sha": "222"},
        ]
    )
    assert blobs["Читай меня.md"] == "111"
    assert blobs["вариант А — карточки/Паранойя (А).md"] == "222"
    assert ".obsidian/app.json" not in blobs
    assert gitlinks == [("GraphNotes", "abc")]


def test_gitlink_children_are_prefixed_folder_notes() -> None:
    extra, nested = split_tree_entries(
        [
            {"path": "GraphNotes.md", "type": "blob", "sha": "note"},
            {"path": "источники.md", "type": "blob", "sha": "src"},
        ],
        prefix="GraphNotes",
    )
    assert extra["GraphNotes/GraphNotes.md"] == "note"
    assert extra["GraphNotes/источники.md"] == "src"
    assert nested == []
    assert folder_note_path("GraphNotes") == "GraphNotes/GraphNotes.md"
