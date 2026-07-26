// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {RewardToken} from "../src/RewardToken.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract RewardTokenTest is Test {
    RewardToken token;

    address owner = address(this); // test contract = owner, biar bisa panggil onlyOwner langsung
    address minter = makeAddr("minter");
    address alice = makeAddr("alice");

    uint256 constant INITIAL = 1000 ether;

    // disalin dari kontrak biar bisa dipakai vm.expectEmit
    event MinterSet(address indexed account, bool allowed);

    function setUp() public {
        token = new RewardToken(INITIAL, owner);
    }

    // --- constructor / state awal ---

    function test_InitialState() public view {
        assertEq(token.name(), "Reward Token");
        assertEq(token.symbol(), "RWD");
        assertEq(token.owner(), owner);
        assertEq(token.totalSupply(), INITIAL);
        assertEq(token.balanceOf(owner), INITIAL);
        assertEq(token.MAX_SUPPLY(), 1_000_000 ether);
    }

    function test_ConstructorRevertsOnZeroOwner() public {
        // Base constructor Ownable(initialOwner) jalan SEBELUM body, jadi OZ yang
        // nolak zero-owner duluan (AlamatNol di constructor jadi unreachable).
        // Yang penting: zero-owner TETAP ditolak = properti keamanannya aman.
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new RewardToken(INITIAL, address(0));
    }

    // --- mint / minter access ---

    function test_OwnerCanMint() public {
        token.mint(alice, 500 ether);
        assertEq(token.balanceOf(alice), 500 ether);
        assertEq(token.totalSupply(), INITIAL + 500 ether);
    }

    function test_SetMinterEmitsAndAllowsMint() public {
        vm.expectEmit(true, false, false, true);
        emit MinterSet(minter, true);
        token.setMinter(minter, true);
        assertTrue(token.isMinter(minter));

        vm.prank(minter);
        token.mint(alice, 100 ether);
        assertEq(token.balanceOf(alice), 100 ether);
    }

    function test_RevokedMinterCannotMint() public {
        token.setMinter(minter, true);
        token.setMinter(minter, false);
        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(RewardToken.BukanMinter.selector, minter));
        token.mint(alice, 1 ether);
    }

    function test_NonMinterCannotMint() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RewardToken.BukanMinter.selector, alice));
        token.mint(alice, 1 ether);
    }

    // --- cap MAX_SUPPLY ---

    function test_MintRevertsAboveMaxSupply() public {
        uint256 sisa = token.MAX_SUPPLY() - token.totalSupply();
        uint256 minta = sisa + 1;
        vm.expectRevert(abi.encodeWithSelector(RewardToken.MelebihiMaxSupply.selector, minta, sisa));
        token.mint(alice, minta);
    }

    function test_CanMintExactlyToMaxSupply() public {
        uint256 sisa = token.MAX_SUPPLY() - token.totalSupply();
        token.mint(alice, sisa);
        assertEq(token.totalSupply(), token.MAX_SUPPLY());
    }

    // --- burn ---

    function test_Burn() public {
        token.mint(alice, 100 ether);
        vm.prank(alice);
        token.burn(40 ether);
        assertEq(token.balanceOf(alice), 60 ether);
        assertEq(token.totalSupply(), INITIAL + 60 ether);
    }

    // --- ownership guards ---

    function test_SetMinterRevertsOnZeroAddress() public {
        vm.expectRevert(RewardToken.AlamatNol.selector);
        token.setMinter(address(0), true);
    }

    function test_OnlyOwnerCanSetMinter() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        token.setMinter(minter, true);
    }

    // --- fuzz: mint berapa pun di bawah cap selalu berhasil ---

    function testFuzz_MintWithinCap(uint256 amount) public {
        uint256 sisa = token.MAX_SUPPLY() - token.totalSupply();
        amount = bound(amount, 0, sisa);
        token.mint(alice, amount);
        assertEq(token.balanceOf(alice), amount);
    }
}
