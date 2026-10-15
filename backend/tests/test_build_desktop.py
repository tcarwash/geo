from build_desktop import build_arguments


def test_build_arguments_skip_external_eccodes_library_when_platform_bundled():
    arguments = build_arguments(include_eccodeslib=False)

    assert "--collect-all=eccodes" in arguments
    assert "--collect-all=eccodeslib" not in arguments


def test_build_arguments_collect_external_eccodes_library_when_available():
    arguments = build_arguments(include_eccodeslib=True)

    assert "--collect-all=eccodes" in arguments
    assert "--collect-all=eccodeslib" in arguments
